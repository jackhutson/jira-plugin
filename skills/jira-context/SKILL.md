---
name: jira-context
description: >
  Use when needing to understand a Jira ticket before acting on it — pulling
  context for an agent, reviewing a ticket's full picture, loading ticket
  details for decision-making, or when asked to "show me" or "what's in" a ticket.
allowed-tools:
  - Bash(node */scripts/jira-plugin.mjs doctor --json)
  - Bash(node */scripts/jira-plugin.mjs resolve-key *)
  - Bash(acli jira workitem view *)
  - Bash(acli jira workitem search *)
  - Bash(acli jira workitem comment list *)
---

# Pull Ticket Context (ACLI)

Fetches a ticket's details, subtasks, and five newest comments, then packages
them as a structured block for agent or human consumption.

Before the ACLI reads, normalize the user-supplied key or number through the
shared helper and use only `data.key` from a successful result:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/jira-plugin.mjs" resolve-key "TICKET_OR_NUMBER" --site "SITE" --json
```

Omit `--site` for an explicit key. For a bare number, use the site established
by SessionStart or `doctor`; pass `--project` only when the user supplied it.
Show the helper's `message` and stop on failure—never reproduce its inference.

## Procedure

1. **Fetch the target ticket** (full fields including description):
```
acli jira workitem view KEY-123 --fields "key,summary,status,assignee,priority,issuetype,description" --json
```

2. **Fetch subtasks:**
```
acli jira workitem search --jql "parent = KEY-123" --fields "key,summary,status" --csv
```

3. **Fetch recent comments:**
```
acli jira workitem comment list --key "KEY-123" --limit 5 --order -created --json
```

4. **Package as structured context:**

```
## KEY-123: "Title"
Status: In Progress | Priority: High | Assignee: [resolved assignee]
Type: Story

### Description
[full description text]

### Subtasks
- KEY-124: "Subtask A" [Done]
- KEY-125: "Subtask B" [In Progress]

### Recent Comments (last 5)
- Alice (2d ago): "Blocked on API access"
- Bob (1d ago): "Unblocked, credentials shared"
```

Always use this output format. Downstream skills depend on its structure.

If the ticket has no subtasks or comments, omit those sections rather than showing empty headings.

## Error Handling

If ACLI fails, run the shared helper's `doctor --json`. When doctor fails, show
its `message` and stop. When doctor is healthy, report the exact failed command
and stderr as an operation error. Retry at most once only when correcting known
invalid input; otherwise stop.
