---
name: jira-transition
description: >
  Use when the user asks to move an issue, transition a ticket, change
  issue status, mark as done, start working on, reopen, or perform any
  workflow status change in Jira.
---

# Jira Workflow Transitions (ACLI)

## Commands

**Transition single issue:**
```
acli jira workitem transition --key "KEY-123" --status "In Progress" --yes
```

**Bulk transition via JQL:**
```
acli jira workitem transition --jql "project = PROJ AND status = 'To Do'" --status "In Progress" --yes
```

ACLI accepts status names directly — no transition ID lookup needed.

## Common Workflow Patterns

```
To Do -> In Progress -> In Review -> Done
```

| User says | Status value |
|-----------|-------------|
| "start working on" | "In Progress" |
| "send for review" | "In Review" |
| "mark as done" | "Done" |
| "reopen" | "To Do" |
| "block" | "Blocked" |

Status names are project-specific. If a transition fails, report the error — the status name may differ in the user's workflow.

## Error Handling

If ACLI returns exit code != 0:
- "authentication failed" -> Tell user: `acli jira auth login --web --site <site>.atlassian.net`
- "command not found: acli" -> Tell user: `brew tap atlassian/homebrew-acli && brew install acli`
- Invalid status/transition -> Report the error, suggest checking available statuses for the issue type
- "trace id:" prefix -> Unexpected server error, report trace ID
- Other -> Report raw error message

## Related Skills

- **jira-issue**: Edit other issue fields (summary, assignee, priority)
- **jira-search**: Find issues to transition using JQL
