# Jira runtime helper

`scripts/jira-plugin.mjs` is the single public runtime boundary for behavior
shared by Jira skills and the SessionStart hook. It owns
ACLI health classification, ticket-key resolution, and workflow configuration.
It does not import the Jira mutation policy, execute ticket mutations, or grant
authorization for them.

## Requirements

- Node.js 22 or newer on macOS, Linux, or Windows
- ACLI `>=1.3.15,<2.0.0` for `doctor`
- Bash only for the SessionStart adapter (Git for Windows supplies it on Windows)
- `CLAUDE_PLUGIN_DATA` supplied by Claude Code for configuration commands

No npm dependencies are required.

## Commands

Every command writes exactly one compact JSON object to standard output. `--json`
documents machine consumption and is accepted on every public command.

```text
jira-plugin doctor --json
jira-plugin resolve-key TICKET_OR_NUMBER [--site SITE] [--project KEY] --json
jira-plugin config get --site SITE --project KEY --json
jira-plugin config set --site SITE --project KEY --from-json FILE|- [--default] --json
```

`doctor` runs bounded, read-only ACLI version and authentication checks. Success
returns the supported version plus `site` for an unambiguous login and `sites`
for every detected login; it never returns the authenticated identity.

`resolve-key` normalizes an explicit key or combines a bare number with an
explicit project, a configured site default, or the site's only configured
project. It fails instead of guessing when the choice is missing or ambiguous.

`config set` accepts one project object with `statuses.start` and
`statuses.done`; optional `workflow_name`, `transitions`, and `required_fields`
are validated when present. `--default` stores that project and the site default
in the same atomic update. Callers must not inspect or repair the backing state
directly.

## Response contract

Success envelope:

```json
{"schema_version":1,"ok":true,"command":"doctor","data":{},"message":"..."}
```

Failure envelope:

```json
{"schema_version":1,"ok":false,"command":"doctor","error":{"code":"AUTH_REQUIRED","message":"..."},"message":"..."}
```

The process exits nonzero on ordinary failures:

| Exit | Error family | Meaning |
|---:|---|---|
| 2 | `USAGE`, invalid ticket/timeout | Invalid arguments |
| 10 | `ACLI_MISSING` | ACLI executable unavailable |
| 11 | `ACLI_UNSUPPORTED`, unparseable version | Version outside the supported contract |
| 12 | `AUTH_REQUIRED` | Login missing or expired |
| 13 | `ADMIN_AUTHORIZATION_REQUIRED` | Site-admin OAuth approval required |
| 14 | `NETWORK_ERROR` | Jira could not be reached |
| 15 | version/auth timeout | Shared health deadline expired |
| 16 | other ACLI health failure | ACLI returned an unclassified failure |
| 20–22 | site/project resolution | Required or ambiguous ticket-key context |
| 23 | `CONFIG_NOT_FOUND` | No configuration for the site/project |
| 24 | `CONFIG_MALFORMED` | Existing state failed schema/JSON validation |
| 25 | configuration input/validation | Invalid input or unavailable plugin data root |
| 26 | `CONFIG_WRITE_FAILED` | Atomic state update could not complete |
| 27 | `CONFIG_LOCK_TIMEOUT` | Concurrent operation did not release the lock |
| 70 | `INTERNAL_ERROR` | Unexpected helper defect |

## Persistence guarantees

The helper hides the backing path and schema from operational skills. Its
storage implementation validates existing and new state, locks reads and writes
across processes, writes a permission-restricted temporary file, syncs it, and
atomically renames it into place. Invalid input, malformed existing state, lock
timeouts, and failed writes do not overwrite the prior state.

The public interface is verified through `tests/jira-plugin-helper.test.sh`.
That fixture covers success, missing and unsupported ACLI, authentication and
network failures, key ambiguity, absent/malformed/invalid configuration,
concurrent writers, lock timeouts, and failed writes.
