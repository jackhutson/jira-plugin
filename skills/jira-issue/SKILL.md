---
name: jira-issue
description: >
  Use when the user asks to view, create, edit, delete, assign, clone,
  or comment on a Jira issue, ticket, or work item. Covers all issue
  CRUD operations via the Atlassian CLI (acli).
---

# Jira Issue Operations (ACLI)

## Commands

**View issue:**
```
acli jira workitem view KEY-123 --fields "key,summary,status,assignee,priority,issuetype" --json
```
Include `description` in `--fields` only when the user asks for details.

**Create issue:**
```
acli jira workitem create --summary "Title" --project "PROJ" --type "Task" --yes
```
Optional flags: `--description "..."`, `--assignee "user@email.com"`, `--priority "High"`, `--labels "label1,label2"`

**Edit issue:**
```
acli jira workitem edit --key "KEY-123" --summary "New title" --yes
```
Any field flag can be combined: `--description`, `--priority`, `--labels`, `--assignee`.

**Delete issue:**
```
acli jira workitem delete --key "KEY-123" --yes
```

**Assign issue:**
```
acli jira workitem assign --key "KEY-123" --assignee "user@email.com"
```

**Clone issue:**
```
acli jira workitem clone --key "KEY-123"
```

**Add comment:**
```
acli jira workitem comment-create --key "KEY-123" --body "Comment text"
```

**List comments:**
```
acli jira workitem comment-list --key "KEY-123"
```

## Field Selection

Default fields: `--fields "key,summary,status,assignee,priority,issuetype"`

Always use `--fields` to control output size. Add `description` only when requested.

## Error Handling

If ACLI returns exit code != 0:
- "authentication failed" -> Tell user: `acli jira auth login --web --site <site>.atlassian.net`
- "command not found: acli" -> Tell user: `brew tap atlassian/homebrew-acli && brew install acli`
- "trace id:" prefix -> Unexpected server error, report trace ID
- Other -> Report raw error message

## Related Skills

- **jira-search**: Find issues with JQL before viewing/editing
- **jira-transition**: Change issue status/workflow state
