#!/usr/bin/env bash

set -euo pipefail

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
helper="$repository_root/scripts/jira-plugin.mjs"
test_root=$(mktemp -d "${TMPDIR:-/tmp}/jira-plugin-helper-test.XXXXXX")
fake_acli="$test_root/acli"
workflow_json="$test_root/workflow.json"

# Invoked indirectly by trap.
# shellcheck disable=SC2329
cleanup() {
    rm -rf -- "$test_root"
}
trap cleanup EXIT HUP INT TERM

cat >"$fake_acli" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "--version" ]; then
    if [ "${ACLI_FAKE_VERSION_DELAY:-0}" != "0" ]; then
        exec sleep "$ACLI_FAKE_VERSION_DELAY"
    fi
    printf '%s\n' "${ACLI_FAKE_VERSION:-acli version 1.3.15-stable}"
    exit "${ACLI_FAKE_VERSION_STATUS:-0}"
fi
if [ "${ACLI_FAKE_AUTH_DELAY:-0}" != "0" ]; then
    exec sleep "$ACLI_FAKE_AUTH_DELAY"
fi
if [ -n "${ACLI_FAKE_AUTH_ERROR:-}" ]; then
    printf '%s\n' "$ACLI_FAKE_AUTH_ERROR" >&2
else
    printf '%s\n' "${ACLI_FAKE_AUTH_OUTPUT:-Site: example.atlassian.net}"
fi
exit "${ACLI_FAKE_AUTH_STATUS:-0}"
EOF
chmod +x "$fake_acli"

cat >"$workflow_json" <<'EOF'
{
  "statuses": {
    "start": "In Progress",
    "done": "Done"
  }
}
EOF

run_helper() {
    helper_status=0
    helper_output=$(node "$helper" "$@") || helper_status=$?
}

assert_result() {
    expected_status="$1"
    expected_ok="$2"
    expected_code="${3:-}"
    if [ "$helper_status" -ne "$expected_status" ]; then
        printf 'Expected exit %s, got %s: %s\n' "$expected_status" "$helper_status" "$helper_output" >&2
        exit 1
    fi
    # JavaScript template literals are evaluated by Node, not the shell.
    # shellcheck disable=SC2016
    HELPER_OUTPUT="$helper_output" EXPECTED_OK="$expected_ok" EXPECTED_CODE="$expected_code" node -e '
      const result = JSON.parse(process.env.HELPER_OUTPUT);
      if (result.schema_version !== 1) throw new Error("wrong schema_version");
      if (String(result.ok) !== process.env.EXPECTED_OK) throw new Error("wrong ok value");
      if (process.env.EXPECTED_CODE && result.error?.code !== process.env.EXPECTED_CODE) {
        throw new Error(`expected ${process.env.EXPECTED_CODE}, got ${result.error?.code}`);
      }
      if (typeof result.message !== "string" || !result.message) throw new Error("missing message");
    '
}

ACLI_BIN="$fake_acli" ACLI_FAKE_AUTH_OUTPUT=$'Site: example.atlassian.net\nUser: secret@example.com' run_helper doctor --json
assert_result 0 true
case "$helper_output" in
    *secret@example.com*) printf '%s\n' 'Doctor leaked authenticated identity.' >&2; exit 1 ;;
esac

ACLI_BIN="$fake_acli" ACLI_FAKE_AUTH_OUTPUT=$'Site: one.atlassian.net\nSite: two.atlassian.net' run_helper doctor --json
assert_result 0 true
HELPER_OUTPUT="$helper_output" node -e '
  const result = JSON.parse(process.env.HELPER_OUTPUT);
  if (result.data.site !== null) throw new Error("multiple sites must remain ambiguous");
  if (result.data.sites.join(",") !== "one.atlassian.net,two.atlassian.net") {
    throw new Error("doctor did not return every authenticated site");
  }
'

ACLI_BIN="$test_root/missing-acli" run_helper doctor --json
assert_result 10 false ACLI_MISSING

ACLI_BIN="$fake_acli" ACLI_FAKE_VERSION='acli version 1.3.14-stable' run_helper doctor --json
assert_result 11 false ACLI_UNSUPPORTED

ACLI_BIN="$fake_acli" ACLI_FAKE_VERSION='acli version 2.0.0-stable' run_helper doctor --json
assert_result 11 false ACLI_UNSUPPORTED

ACLI_BIN="$fake_acli" ACLI_FAKE_AUTH_ERROR='Authentication expired' ACLI_FAKE_AUTH_STATUS=1 run_helper doctor --json
assert_result 12 false AUTH_REQUIRED

ACLI_BIN="$fake_acli" ACLI_FAKE_AUTH_ERROR='network connection refused' ACLI_FAKE_AUTH_STATUS=1 run_helper doctor --json
assert_result 14 false NETWORK_ERROR

ACLI_BIN="$fake_acli" ACLI_FAKE_AUTH_ERROR='Your site admin must authorize this app for the site example.atlassian.net before the app can access your account.' ACLI_FAKE_AUTH_STATUS=1 run_helper doctor --json
assert_result 13 false ADMIN_AUTHORIZATION_REQUIRED
case "$helper_output" in
    *'choose Web, and select the affected site'*) ;;
    *) printf '%s\n' 'Admin authorization remediation is incomplete.' >&2; exit 1 ;;
esac

data_root="$test_root/data"
run_helper resolve-key proj-123 --json
assert_result 0 true
case "$helper_output" in
    *'"key":"PROJ-123"'*) ;;
    *) printf 'Expected normalized explicit key, got: %s\n' "$helper_output" >&2; exit 1 ;;
esac

run_helper resolve-key 123 --project proj --json
assert_result 0 true
case "$helper_output" in
    *'"key":"PROJ-123"'*) ;;
    *) printf 'Expected project-qualified key, got: %s\n' "$helper_output" >&2; exit 1 ;;
esac

run_helper config get --site example.atlassian.net --project PROJ --json
assert_result 25 false CONFIG_INVALID

CLAUDE_PLUGIN_DATA="$data_root" run_helper config get --site example.atlassian.net --project PROJ --json
assert_result 23 false CONFIG_NOT_FOUND

CLAUDE_PLUGIN_DATA="$data_root" run_helper resolve-key 123 --site example.atlassian.net --json
assert_result 21 false PROJECT_REQUIRED

CLAUDE_PLUGIN_DATA="$data_root" run_helper config set --site example.atlassian.net --project PROJ --from-json "$workflow_json" --default --json
assert_result 0 true
CLAUDE_PLUGIN_DATA="$data_root" run_helper config get --site example.atlassian.net --project PROJ --json
assert_result 0 true

helper_status=0
helper_output=$(printf '%s\n' '{"statuses":{"start":"Doing","done":"Complete"}}' | \
    CLAUDE_PLUGIN_DATA="$data_root" node "$helper" config set \
        --site example.atlassian.net --project STDIN --from-json - --json) || helper_status=$?
assert_result 0 true
CLAUDE_PLUGIN_DATA="$data_root" run_helper config get --site example.atlassian.net --project STDIN --json
assert_result 0 true
case "$helper_output" in
    *'"start":"Doing"'*'"done":"Complete"'*) ;;
    *) printf 'Expected stdin configuration, got: %s\n' "$helper_output" >&2; exit 1 ;;
esac

state_before=$(cat "$data_root/workflows.json")
printf '%s\n' '{"statuses":{"start":"In Progress"}}' >"$test_root/invalid-workflow.json"
CLAUDE_PLUGIN_DATA="$data_root" run_helper config set --site example.atlassian.net --project PROJ --from-json "$test_root/invalid-workflow.json" --json
assert_result 25 false CONFIG_INVALID
if [ "$(cat "$data_root/workflows.json")" != "$state_before" ]; then
    printf '%s\n' 'Invalid configuration changed prior state.' >&2
    exit 1
fi

printf '%s\n' '{not-json' >"$test_root/not-json.json"
CLAUDE_PLUGIN_DATA="$data_root" run_helper config set --site example.atlassian.net --project PROJ --from-json "$test_root/not-json.json" --json
assert_result 25 false CONFIG_INPUT_INVALID

CLAUDE_PLUGIN_DATA="$data_root" run_helper resolve-key 123 --site example.atlassian.net --json
assert_result 0 true
case "$helper_output" in
    *'"key":"PROJ-123"'*) ;;
    *) printf 'Expected resolved key, got: %s\n' "$helper_output" >&2; exit 1 ;;
esac

CLAUDE_PLUGIN_DATA="$data_root" run_helper config set --site example.atlassian.net --project OTHER --from-json "$workflow_json" --json
assert_result 0 true
rm -f "$data_root/workflows.json"
CLAUDE_PLUGIN_DATA="$data_root" run_helper config set --site example.atlassian.net --project PROJ --from-json "$workflow_json" --json
assert_result 0 true
CLAUDE_PLUGIN_DATA="$data_root" run_helper config set --site example.atlassian.net --project OTHER --from-json "$workflow_json" --json
assert_result 0 true
CLAUDE_PLUGIN_DATA="$data_root" run_helper resolve-key 123 --site example.atlassian.net --json
assert_result 22 false AMBIGUOUS_PROJECT

malformed_root="$test_root/malformed"
mkdir -p "$malformed_root"
printf '%s\n' '{ not-json' >"$malformed_root/workflows.json"
malformed_before=$(cat "$malformed_root/workflows.json")
CLAUDE_PLUGIN_DATA="$malformed_root" run_helper config get --site example.atlassian.net --project PROJ --json
assert_result 24 false CONFIG_MALFORMED
if [ "$(cat "$malformed_root/workflows.json")" != "$malformed_before" ]; then
    printf '%s\n' 'Malformed state was changed.' >&2
    exit 1
fi

concurrent_root="$test_root/concurrent"
pids=""
for project in P1 P2 P3 P4 P5 P6 P7 P8; do
    CLAUDE_PLUGIN_DATA="$concurrent_root" node "$helper" config set \
        --site example.atlassian.net --project "$project" \
        --from-json "$workflow_json" --json >"$test_root/$project.log" &
    pids="$pids $!"
done
for pid in $pids; do
    wait "$pid"
done
# The JavaScript template literal is evaluated by Node, not the shell.
# shellcheck disable=SC2016
STATE_PATH="$concurrent_root/workflows.json" node -e '
  const fs = require("node:fs");
  const state = JSON.parse(fs.readFileSync(process.env.STATE_PATH, "utf8"));
  const projects = Object.keys(state.sites["example.atlassian.net"].projects);
  if (projects.length !== 8) throw new Error(`expected 8 concurrent writes, got ${projects.length}`);
'
if find "$concurrent_root" -maxdepth 1 -type f ! -name workflows.json | grep -q .; then
    printf '%s\n' 'Concurrent writes left a lock or temporary file.' >&2
    exit 1
fi

locked_root="$test_root/locked"
mkdir -p "$locked_root"
: >"$locked_root/.workflows.json.lock"
CLAUDE_PLUGIN_DATA="$locked_root" JIRA_PLUGIN_CONFIG_LOCK_TIMEOUT_MS=25 run_helper config get --site example.atlassian.net --project PROJ --json
assert_result 27 false CONFIG_LOCK_TIMEOUT

failed_root="$test_root/not-a-directory"
printf '%s\n' 'preserve me' >"$failed_root"
CLAUDE_PLUGIN_DATA="$failed_root" run_helper config set --site example.atlassian.net --project PROJ --from-json "$workflow_json" --json
assert_result 26 false CONFIG_WRITE_FAILED
if [ "$(cat "$failed_root")" != "preserve me" ]; then
    printf '%s\n' 'Failed write changed its existing target.' >&2
    exit 1
fi

printf '%s\n' 'Jira helper interface fixtures passed (doctor, keys, config, concurrency, failures)'
