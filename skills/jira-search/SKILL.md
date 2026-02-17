---
name: jira-search
description: >
  Use when the user asks to search Jira, find issues, run a JQL query,
  list issues matching criteria, or query issues by status, assignee,
  project, sprint, or date. Provides JQL reference and ACLI search commands.
---

# Jira Search & JQL (ACLI)

## Search Commands

**JSON output (structured):**
```
acli jira workitem search --jql "PROJECT = PROJ AND status != Done" --fields "key,summary,status,assignee" --json
```

**CSV output (compact tabular):**
```
acli jira workitem search --jql "assignee = currentUser()" --fields "key,summary,status" --csv
```

**Count only:**
```
acli jira workitem search --jql "project = PROJ AND issuetype = Bug" --count
```

**With pagination (large result sets):**
```
acli jira workitem search --jql "project = PROJ" --fields "key,summary,status" --paginate
```

Always include `--fields` to control output size.

## JQL Reference

### Assignment
```
assignee = currentUser()
assignee = "user@email.com"
assignee is EMPTY
```

### Status
```
status = "In Progress"
status in ("To Do", "In Progress")
status != Done
statusCategory = "Done"
statusCategory in ("To Do", "In Progress")
```

### Type and Project
```
issuetype in (Bug, Story, Task)
issuetype = Bug
project = "PROJ"
project in ("PROJ1", "PROJ2")
```

### Sprint
```
sprint in openSprints()
sprint in closedSprints()
sprint = "Sprint 42"
```

### Dates
```
created >= -7d
updated >= -24h
due < now()                    # overdue
due <= endOfWeek()
created >= startOfMonth()
resolved >= -30d
```

**Date functions:** `now()`, `startOfDay()`, `endOfDay()`, `startOfWeek()`, `endOfWeek()`, `startOfMonth()`, `endOfMonth()`

**Relative dates:** `-1d`, `-7d`, `-1w`, `-1m`

### Text Search
```
text ~ "search term"
summary ~ "keyword"
description ~ "error message"
```

### Labels and Components
```
labels in ("backend", "urgent")
labels = "frontend"
component = "API"
```

### Priority
```
priority = "High"
priority in ("High", "Highest")
```

### Ordering
```
ORDER BY priority DESC, updated DESC
ORDER BY created ASC
ORDER BY due ASC
```

### Combining
```
project = PROJ AND status != Done AND assignee = currentUser()
(status = "To Do" OR status = "In Progress") AND project = PROJ
project = PROJ AND issuetype = Bug AND priority in ("High", "Highest") ORDER BY created DESC
```

## Common Patterns

| Intent | JQL |
|--------|-----|
| My open issues | `assignee = currentUser() AND status != Done ORDER BY priority DESC` |
| Bugs in project | `project = PROJ AND issuetype = Bug AND status != Done` |
| Recently updated | `project = PROJ AND updated >= -24h ORDER BY updated DESC` |
| Overdue | `due < now() AND status != Done ORDER BY due ASC` |
| Unassigned | `project = PROJ AND assignee is EMPTY AND status != Done` |
| Current sprint | `sprint in openSprints() AND project = PROJ` |

## Error Handling

If ACLI returns exit code != 0:
- "authentication failed" -> Tell user: `acli jira auth login --web --site <site>.atlassian.net`
- "command not found: acli" -> Tell user: `brew tap atlassian/homebrew-acli && brew install acli`
- JQL syntax error -> Show the error message, suggest corrected JQL syntax
- "trace id:" prefix -> Unexpected server error, report trace ID
- Other -> Report raw error message

## Related Skills

- **jira-issue**: View/edit individual issues found via search
- **jira-transition**: Change status of issues found via search
