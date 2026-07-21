#!/usr/bin/env bash

set -euo pipefail

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repository_root"

group=${1:-all}

validate_plugin() {
    node scripts/validate-json.mjs
    while IFS= read -r file; do
        node --check "$file"
    done < <(find scripts tests -type f -name '*.mjs' -print | sort)
    claude plugin validate --strict .
    node scripts/check-release.mjs
    claude --plugin-dir . plugin details jira | \
        node scripts/check-readme-inventory.mjs --stdin
    bash scripts/smoke-test-install.sh
}

validate_shell_and_hooks() {
    local shell_files=(hooks/session-start)
    local file
    while IFS= read -r file; do
        shell_files+=("$file")
    done < <(find scripts tests -type f -name '*.sh' -print | sort)
    if ! command -v shellcheck >/dev/null 2>&1; then
        printf '%s\n' 'ShellCheck is required. Install it with brew install shellcheck or your system package manager.' >&2
        return 1
    fi
    bash -n "${shell_files[@]}"
    shellcheck "${shell_files[@]}"
    bash tests/session-start-hook.test.sh
}

validate_behavior() {
    local test_files=()
    local file
    while IFS= read -r file; do
        if [ "$file" != "tests/acli-command-contract.test.mjs" ]; then
            test_files+=("$file")
        fi
    done < <(find tests -maxdepth 1 -type f -name '*.test.mjs' -print | sort)
    node --test "${test_files[@]}"
    bash tests/jira-plugin-helper.test.sh
    node scripts/run-model-evals.mjs --validate
}

validate_command_contract() {
    node tests/acli-command-contract.test.mjs
}

case "$group" in
    plugin)
        validate_plugin
        ;;
    shell)
        validate_shell_and_hooks
        ;;
    behavior)
        validate_behavior
        ;;
    contract)
        validate_command_contract
        ;;
    all)
        validate_plugin
        validate_shell_and_hooks
        validate_behavior
        validate_command_contract
        ;;
    *)
        printf 'Unknown validation group: %s\n' "$group" >&2
        printf '%s\n' 'Expected one of: all, plugin, shell, behavior, contract' >&2
        exit 2
        ;;
esac
