# Ad-hoc mutation contracts

Read this file only for ad-hoc work-item mutations. Apply
`${CLAUDE_PLUGIN_ROOT}/docs/mutation-safety.md` first. Complete progress,
decomposition, and ticket-work workflows belong to their specific skills.

Always inspect the relevant command's `--help` when a requested option is not
shown below. The supported range is `acli >=1.3.15,<2.0.0`.

## Create

`create` does not support `--yes`. Before multi-ticket creation, preview every
ticket and relationship, wait for confirmation, then create sequentially and
stop on the first failed or unknown outcome.

```bash
acli jira workitem create \
  --summary "Title" --project "TEAM" --type "Task" --json

acli jira workitem create --from-json /path/to/workitem.json --json
```

Use `references/custom-fields.md` only when the create needs fields unavailable
as flags.

## Edit, transition, and assign

Resolve a JQL request read-only, preview and freeze its exact keys, then mutate
only by `--key`. Never pass a live selector to a mutation.

```bash
acli jira workitem search \
  --jql "project = TEAM AND status = Open" --fields "key" --json

acli jira workitem edit \
  --key "TEAM-101,TEAM-102" --labels "triaged" --yes --json

acli jira workitem transition \
  --key "TEAM-101,TEAM-102" --status "Done" \
  --yes --ignore-errors --json

acli jira workitem assign \
  --key "TEAM-101" --assignee "@me" --yes --json
```

Use an email or account ID only when it was resolved from the user's explicit
input. Never guess an identity. `edit --from-json` has a limited schema; inspect
`edit --generate-json` and do not assume create-only custom fields can be edited.

When `--ignore-errors` is used, reconcile every key and stop follow-ons unless
all eligible targets succeeded.

## Comments

```bash
acli jira workitem comment create \
  --key "TEAM-101" --body "Progress update" --json

acli jira workitem comment list \
  --key "TEAM-101" --limit 5 --order -created --json

acli jira workitem comment update \
  --key "TEAM-101" --id "10001" --body "Corrected update"

acli jira workitem comment delete \
  --key "TEAM-101" --id "10001"
```

For comments on multiple tickets, preview the body and every exact key. Stop at
the first failed or unknown result.

## Archive and delete

Archive and delete operations always use the shared preview gate, even for one
target. Project deletion always requires a preview through the same policy.
Inspect the exact command help, show irreversible effects, wait for explicit
confirmation, and use only the confirmed frozen target set.
