#!/usr/bin/env bash

set -eu

test_root=$(mktemp -d "${TMPDIR:-/tmp}/jira-session-hook-test.XXXXXX")
plugin_root="${test_root}/plugin root with spaces"
hook_root="${plugin_root}/hooks"
script_root="${plugin_root}/scripts"
fake_bin="${test_root}/fake bin"
call_log="${test_root}/acli-calls"
fixture_version="acli version 1.3.15-stable"
fixture_version_delay=0

cleanup() {
    rm -rf -- "$test_root"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$hook_root" "$script_root" "$fake_bin"
cp hooks/run-hook.cmd hooks/session-start "$hook_root/"
cp scripts/acli-version.mjs scripts/jira-plugin.mjs scripts/workflow-config.mjs "$script_root/"

assert_contains() {
    case "$1" in
        *"$2"*) ;;
        *)
            printf 'Expected output to contain: %s\nActual: %s\n' "$2" "$1" >&2
            exit 1
            ;;
    esac
}

assert_not_contains() {
    case "$1" in
        *"$2"*)
            printf 'Expected output not to contain: %s\nActual: %s\n' "$2" "$1" >&2
            exit 1
            ;;
        *) ;;
    esac
}

assert_hook_json() {
    HOOK_OUTPUT="$1" node -e '
      const parsed = JSON.parse(process.env.HOOK_OUTPUT);
      const keys = Object.keys(parsed);
      if (keys.length !== 1 || keys[0] !== "hookSpecificOutput") process.exit(1);
      const output = parsed.hookSpecificOutput;
      if (output.hookEventName !== "SessionStart") process.exit(1);
      if (typeof output.additionalContext !== "string") process.exit(1);
    '
}

write_acli_fixture() {
    fixture_version="$1"
    fixture_body="$2"
    fixture_version_delay="${3:-0}"
    {
        printf '%s\n' '#!/usr/bin/env bash'
        # The generated fixture must expand this variable when it runs.
        # shellcheck disable=SC2016
        printf '%s\n' 'printf "called:%s\\n" "$*" >>"$ACLI_CALL_LOG"'
        # These generated fixture variables expand only when the fixture runs.
        # shellcheck disable=SC2016
        printf '%s\n' 'if [ "${1:-}" = "--version" ]; then'
        # shellcheck disable=SC2016
        printf '%s\n' '    if [ "$ACLI_FIXTURE_VERSION_DELAY" != "0" ]; then exec sleep "$ACLI_FIXTURE_VERSION_DELAY"; fi'
        # shellcheck disable=SC2016
        printf '%s\n' '    printf "%s\\n" "$ACLI_FIXTURE_VERSION"'
        printf '%s\n' '    exit 0'
        printf '%s\n' 'fi'
        printf '%s\n' "$fixture_body"
    } >"${fake_bin}/acli"
    chmod +x "${fake_bin}/acli"
    : >"$call_log"
}

run_hook() {
    PATH="${fake_bin}:/usr/bin:/bin" \
    ACLI_BIN='' \
    ACLI_CALL_LOG="$call_log" \
    ACLI_FIXTURE_VERSION="$fixture_version" \
    ACLI_FIXTURE_VERSION_DELAY="$fixture_version_delay" \
    CLAUDE_PLUGIN_ROOT="$plugin_root" \
    JIRA_PLUGIN_AUTH_TIMEOUT_SECONDS="${1:-2}" \
    bash "${hook_root}/run-hook.cmd" session-start
}

assert_not_called() {
    if [ -s "$call_log" ]; then
        printf 'Expected no ACLI call, got: %s\n' "$(cat "$call_log")" >&2
        exit 1
    fi
}

assert_standard_calls() {
    calls=$(cat "$call_log")
    if [ "$calls" != "called:--version
called:jira auth status" ]; then
        printf 'Expected version and auth calls, got: %s\n' "$calls" >&2
        exit 1
    fi
}

assert_version_call_only() {
    calls=$(cat "$call_log")
    if [ "$calls" != "called:--version" ]; then
        printf 'Expected one version call, got: %s\n' "$calls" >&2
        exit 1
    fi
}

missing_output=$(run_hook)
assert_hook_json "$missing_output"
assert_contains "$missing_output" "ACLI is not installed"

invalid_timeout_output=$(run_hook 0)
assert_hook_json "$invalid_timeout_output"
assert_contains "$invalid_timeout_output" "must be a positive integer"

write_acli_fixture 'acli version 1.3.15-stable' 'printf "Site: example.atlassian.net\\n"; exit 0'
mv "$script_root/jira-plugin.mjs" "$script_root/jira-plugin.mjs.saved"
helper_failure_output=$(run_hook)
assert_hook_json "$helper_failure_output"
assert_contains "$helper_failure_output" "runtime helper failed"
assert_not_called
mv "$script_root/jira-plugin.mjs.saved" "$script_root/jira-plugin.mjs"

write_acli_fixture 'acli version 1.3.14-stable' 'printf "Site: example.atlassian.net\\n"; exit 0'
below_output=$(run_hook)
assert_hook_json "$below_output"
assert_contains "$below_output" "ACLI 1.3.14 is unsupported"
assert_contains "$below_output" ">=1.3.15,<2.0.0"
assert_version_call_only

write_acli_fixture 'acli version 2.0.0-stable' 'printf "Site: example.atlassian.net\\n"; exit 0'
above_output=$(run_hook)
assert_hook_json "$above_output"
assert_contains "$above_output" "ACLI 2.0.0 is unsupported"
assert_version_call_only

write_acli_fixture 'unexpected version output' 'printf "Site: example.atlassian.net\\n"; exit 0'
unparsed_version_output=$(run_hook)
assert_hook_json "$unparsed_version_output"
assert_contains "$unparsed_version_output" "Could not determine the ACLI version"
assert_version_call_only

write_acli_fixture 'acli version 1.3.22-stable' 'printf "Site: example.atlassian.net\\n"; exit 0' 30
version_timeout_output=$(run_hook 1)
assert_hook_json "$version_timeout_output"
assert_contains "$version_timeout_output" "version check timed out after 1s"
assert_version_call_only

write_acli_fixture 'acli version 1.3.15-stable' 'printf "Site: example.atlassian.net\\nUser: secret@example.com\\n"; exit 0'
success_output=$(run_hook)
assert_hook_json "$success_output"
assert_contains "$success_output" "ACLI ready for example.atlassian.net"
assert_contains "$success_output" "version 1.3.15"
assert_not_contains "$success_output" "secret@example.com"
assert_standard_calls

write_acli_fixture 'acli version 1.9.99-stable' 'printf "Authentication expired\\n" >&2; exit 1'
auth_output=$(run_hook)
assert_hook_json "$auth_output"
assert_contains "$auth_output" "authentication is missing or expired"
assert_standard_calls

write_acli_fixture 'acli version 1.3.15-stable' 'printf "Your site admin must authorize this app for the site example.atlassian.net before the app can access your account.\\n" >&2; exit 1'
admin_output=$(run_hook)
assert_hook_json "$admin_output"
assert_contains "$admin_output" "site admin to re-authorize this site"
assert_contains "$admin_output" "choose Web, and select the affected site"
assert_standard_calls

write_acli_fixture 'acli version 1.3.15-stable' 'printf "dial tcp: no such host\\n" >&2; exit 1'
network_output=$(run_hook)
assert_hook_json "$network_output"
assert_contains "$network_output" "could not reach Jira"
assert_standard_calls

write_acli_fixture 'acli version 1.3.15-stable' 'printf "unrecognized failure shape\\n" >&2; exit 42'
unknown_output=$(run_hook)
assert_hook_json "$unknown_output"
assert_contains "$unknown_output" "failed unexpectedly (exit 42)"
assert_standard_calls

write_acli_fixture 'acli version 1.3.15-stable' 'printf "success without a hostname\\n"; exit 0'
malformed_output=$(run_hook)
assert_hook_json "$malformed_output"
assert_contains "$malformed_output" "reported success but did not identify a Jira site"
assert_standard_calls

write_acli_fixture 'acli version 1.3.15-stable' 'exec sleep 30'
timeout_output=$(run_hook 1)
assert_hook_json "$timeout_output"
assert_contains "$timeout_output" "health check timed out after 1s"
assert_standard_calls

printf 'SessionStart hook fixtures passed (14 branches, including version bounds and path with spaces)\n'
