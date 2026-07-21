---
name: acli
description: >
  Use for ad-hoc Jira operations through Atlassian CLI: JQL searches, work-item
  create/edit/delete, comments, projects, filters, sprints, boards, fields, or
  dashboards. Prefer a specific jira-* outcome skill when one matches.
---

# Ad-hoc Jira operations with ACLI

Use the installed ACLI executable as the command manual. This plugin supports
`acli >=1.3.15,<2.0.0`; command help from that installed version is authoritative.

Before any Jira mutation, read and apply
`${CLAUDE_PLUGIN_ROOT}/docs/mutation-safety.md`. A documented command shape or
`--yes` flag never grants authorization.

## Runtime prerequisite

Run the shared, read-only health check once when SessionStart has not already
reported readiness:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/jira-plugin.mjs" doctor --json
```

Proceed only on `ok: true`. On failure, show the helper's stable `message` and
stop. Never start interactive login or switch accounts automatically.

## Discover the command contract

Before using an uncertain, unfamiliar, or version-sensitive command, inspect
help at the narrowest relevant level:

```bash
acli jira --help
acli jira workitem --help
acli jira workitem edit --help
```

Use only flags shown by that executable. If a command fails with a usage error,
read its help once, correct known invalid input once, then stop and report the
exact command and stderr. Do not guess flag variants or fall back to raw APIs.

For output that another command or decision consumes, request `--json` and
parse it. For human-facing searches, limit fields and results. Resolve JQL or
filter selectors with a read-only search before any mutation; preview and freeze
the exact returned keys under the shared policy.

## Load supporting guidance only when needed

Do not read every reference by default.

| Need | Read |
|---|---|
| Create, edit, transition, assign, comment, archive, or delete | `references/mutations.md` |
| Create-time custom fields, ADF, story points, sprint, or components | `references/custom-fields.md` |
| Projects, boards, sprints, filters, fields, or dashboards | `references/planning-resources.md` |

For ordinary searches and views, live `--help` plus the rules above are enough.
Specific end-to-end outcomes belong to `jira-context`, `jira-progress`,
`jira-work`, `jira-decompose`, or `jira-workflow`; do not recreate them here.

## Supported-range gotchas

These retained claims are contract-tested on the minimum and latest supported
ACLI binaries:

- `workitem create` has `--json` and `--from-json`, but no `--yes`.
- Mutating edit/transition/assign commands expose `--yes`; use it only after the
  shared policy authorizes the exact mutation.
- Comment update/delete identify a comment with `--id`, not `--comment-id`.
- Sprint work-item listing requires both `--sprint` and `--board`.
- Favourite filters use `--filter-id`.
- Project update identifies the source with `--project-key`.
- Use `board get --id ... --json` across the supported range. Newer 1.x help may
  deprecate it, but `board view` is absent from 1.3.15.

## Failure handling

On a non-usage ACLI failure, run the shared helper's `doctor --json`. If doctor
fails, show its message and stop. If it succeeds, report the exact failed
command and stderr as an operation error. Retry only once and only for known
invalid input. Never invent field IDs, status names, account IDs, or permissions.

For batch output, reconcile every requested key. Partial success is committed
state: stop before follow-on mutations and report succeeded, failed, unknown,
and not-attempted targets without claiming rollback.
