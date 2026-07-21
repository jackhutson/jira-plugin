# Projects and planning resources

Read this file only for ad-hoc project, board, sprint, filter, field, or
dashboard work. Inspect the narrow command's `--help` before execution. The
supported range is `acli >=1.3.15,<2.0.0`.

## Projects

```bash
acli jira project list --json
acli jira project view --key "TEAM" --json
acli jira project update \
  --project-key "TEAM" --name "New Team Name"
```

Project archive/delete are hard-to-reverse. Resolve the exact project, preview
the effect, and wait for explicit confirmation under the shared mutation policy.

## Boards and sprints

Use `board get` as the 1.3.15-to-latest shared contract; `board view` is not
available at the minimum supported version.

```bash
acli jira board search --name "Team Board" --json
acli jira board get --id 123 --json
acli jira board list-sprints --id 123 --json
acli jira sprint list-workitems --sprint 456 --board 123 --json
```

Do not infer a board from a sprint. Supply both identifiers when listing sprint
work items.

## Filters

```bash
acli jira filter list --json
acli jira filter get --id 10001 --json
acli jira filter add-favourite --filter-id 10001
```

## Fields and dashboards

These surfaces change more often and have no retained plugin-specific workflow.
Start with live help and descend to the exact command:

```bash
acli jira field --help
acli jira dashboard --help
```

For any mutation, apply the shared policy and request parseable output when the
command exposes it.
