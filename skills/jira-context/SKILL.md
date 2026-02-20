---
name: jira-context
description: >
  Use when needing to understand a Jira ticket before acting on it — pulling
  context for an agent, reviewing a ticket's full picture, loading ticket
  details for decision-making, or when asked to "show me" or "what's in" a ticket.
---

# Pull Ticket Context (ACLI)

Fetches a ticket and its full picture — subtasks, comments, linked context — and packages it as a structured block for agent or human consumption.

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
acli jira workitem comment-list --key "KEY-123"
```

4. **Package as structured context:**

```
## KEY-123: "Title"
Status: In Progress | Priority: High | Assignee: user@email.com
Type: Story | Sprint: Sprint 42

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

If ACLI returns exit code != 0:
- "authentication failed" → Tell user: `acli jira auth login --web --site <site>.atlassian.net`
- "command not found: acli" → Tell user: `brew tap atlassian/homebrew-acli && brew install acli`
- "trace id:" prefix → Unexpected server error, report trace ID
- Other → Report raw error message
