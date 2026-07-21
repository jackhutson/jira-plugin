#!/usr/bin/env bash

set -euo pipefail

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repository_root"

probe_root=$(mktemp -d "${TMPDIR:-/tmp}/jira-ci-negative.XXXXXX")

# Invoked indirectly by trap.
# shellcheck disable=SC2329
cleanup() {
    rm -rf -- "$probe_root"
}
trap cleanup EXIT HUP INT TERM

manifest_root="$probe_root/manifest"
mkdir -p "$manifest_root"
cp -R .claude-plugin "$manifest_root/"
# The JavaScript template literal must be evaluated by Node, not the shell.
# shellcheck disable=SC2016
node -e '
  const fs = require("node:fs");
  const path = process.argv[1];
  const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
  delete manifest.name;
  fs.writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
' "$manifest_root/.claude-plugin/plugin.json"

if claude plugin validate --strict "$manifest_root" >"$probe_root/manifest.log" 2>&1; then
    printf '%s\n' 'Expected invalid manifest probe to fail.' >&2
    exit 1
fi
if ! grep -Eiq 'name|required|invalid' "$probe_root/manifest.log"; then
    cat "$probe_root/manifest.log" >&2
    printf '%s\n' 'Manifest probe failed without an actionable diagnostic.' >&2
    exit 1
fi
printf '%s\n' 'Negative probe passed: manifest validation failed actionably'

hook_root="$probe_root/hook"
mkdir -p "$hook_root/scripts"
cp -R hooks tests "$hook_root/"
cp scripts/acli-version.mjs scripts/jira-plugin.mjs scripts/workflow-config.mjs \
    "$hook_root/scripts/"
node -e '
  const fs = require("node:fs");
  const path = process.argv[1];
  const source = fs.readFileSync(path, "utf8");
  fs.writeFileSync(path, source.replace("\n", "\nprintf \"not-json\\\\n\"\nexit 0\n"));
' "$hook_root/hooks/session-start"

if (cd "$hook_root" && bash tests/session-start-hook.test.sh) >"$probe_root/hook.log" 2>&1; then
    printf '%s\n' 'Expected malformed hook JSON probe to fail.' >&2
    exit 1
fi
if ! grep -Eiq 'SyntaxError|JSON' "$probe_root/hook.log"; then
    cat "$probe_root/hook.log" >&2
    printf '%s\n' 'Hook probe failed without an actionable JSON diagnostic.' >&2
    exit 1
fi
printf '%s\n' 'Negative probe passed: malformed hook JSON failed actionably'

fake_acli="$probe_root/acli"
cat >"$fake_acli" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "--version" ]; then
    printf '%s\n' 'acli version 1.3.22-stable'
else
    printf '%s\n' 'Flags:' '  --json'
fi
EOF
chmod +x "$fake_acli"

if ACLI_BIN="$fake_acli" ACLI_EXPECTED_VERSION=1.3.22-stable \
    node tests/acli-command-contract.test.mjs >"$probe_root/acli.log" 2>&1; then
    printf '%s\n' 'Expected broken ACLI command contract probe to fail.' >&2
    exit 1
fi
if ! grep -Fq 'missing required flag' "$probe_root/acli.log"; then
    cat "$probe_root/acli.log" >&2
    printf '%s\n' 'ACLI probe failed without an actionable missing-flag diagnostic.' >&2
    exit 1
fi
printf '%s\n' 'Negative probe passed: ACLI contract failed actionably'
