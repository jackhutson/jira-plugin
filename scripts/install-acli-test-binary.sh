#!/usr/bin/env bash

set -euo pipefail

target=${1:-}
destination=${2:-}

if [ -z "$target" ] || [ -z "$destination" ]; then
    printf 'Usage: %s <minimum|latest> <destination>\n' "$0" >&2
    exit 2
fi

mkdir -p "$(dirname "$destination")"

case "$target" in
    minimum)
        archive=$(mktemp "${TMPDIR:-/tmp}/acli-1.3.15.XXXXXX.tar.gz")
        extract_root=$(mktemp -d "${TMPDIR:-/tmp}/acli-1.3.15.XXXXXX")

        # Invoked indirectly by trap.
        # shellcheck disable=SC2329
        cleanup() {
            rm -f -- "$archive"
            rm -rf -- "$extract_root"
        }
        trap cleanup EXIT HUP INT TERM

        curl --fail --silent --show-error --location \
            https://acli.atlassian.com/linux/1.3.15-stable/acli_1.3.15-stable_linux_amd64.tar.gz \
            --output "$archive"
        # The JavaScript template literal must be evaluated by Node, not the shell.
        # shellcheck disable=SC2016
        node -e '
          const crypto = require("node:crypto");
          const fs = require("node:fs");
          const actual = crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex");
          const expected = "809f1bba338df1a4a4fa2003e2f8cd3789e1e65cbba5c7b370d629b44810b9bf";
          if (actual !== expected) throw new Error(`ACLI 1.3.15 checksum mismatch: ${actual}`);
        ' "$archive"
        tar -xzf "$archive" -C "$extract_root" --strip-components=1
        cp "$extract_root/acli" "$destination"
        ;;
    latest)
        curl --fail --silent --show-error --location \
            https://acli.atlassian.com/linux/latest/acli_linux_amd64/acli \
            --output "$destination"
        ;;
    *)
        printf 'Unknown ACLI test target: %s\n' "$target" >&2
        exit 2
        ;;
esac

chmod +x "$destination"
"$destination" --version
