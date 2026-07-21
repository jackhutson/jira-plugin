# ACLI command-contract baseline

The Jira plugin's documented commands were verified on 2026-07-20 against the
official Linux `acli version 1.3.22-stable` binary. Compatibility checks also
run this curated surface on the minimum supported `1.3.15-stable` binary. The
supported range is `>=1.3.15,<2.0.0`.

The executable's `--help` output is authoritative when it differs from the
published command page. In particular, ACLI 1.3.22 uses `--filter-id` for
`jira filter add-favourite`; the published web reference still showed
`--filterId` when this baseline was recorded.

To repeat the checks with an installed binary:

```bash
ACLI_BIN="$(command -v acli)" \
ACLI_EXPECTED_VERSION="1.3.22-stable" \
node tests/acli-command-contract.test.mjs

node tests/documented-workflow-contract.test.mjs
```

The executable test covers ticket reads and searches, creation, edits, single
and batch transitions, assignment, comment create/list/update/delete, project
list/view/update, board search/view/sprints, sprint work items, and filter
list/view/favourite operations. The documented workflow test protects mutation
ordering, recent-comment ordering, per-ticket partial failure reporting, and
authentication behavior.

`jira board get` is intentionally retained as the shared 1.3.15–1.3.22 command
shape. Newer 1.x releases deprecate it in favor of `board view`, but the latter
does not exist in the minimum supported release. Raise the minimum version
before switching this contract.

Official reference: <https://developer.atlassian.com/cloud/acli/reference/commands/>
