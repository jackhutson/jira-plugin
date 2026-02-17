---
name: jira-planning
description: >
  Use when the user asks for standup prep, daily planning, their current
  tasks, workload review, team status, or "what am I working on". Provides
  compound workflows built from multiple ACLI search commands.
---

# Jira Planning Workflows (ACLI)

Compound workflows that combine multiple ACLI searches into formatted summaries. These are the strongest case for subagent mode — multiple searches, only the final formatted result matters.

## Standup Prep

Run these two searches and format the results:

**1. Done yesterday:**
```
acli jira workitem search --jql "assignee = currentUser() AND sprint in openSprints() AND status changed AFTER startOfDay(-1)" --fields "key,summary,status" --csv
```

**2. Working on today:**
```
acli jira workitem search --jql "assignee = currentUser() AND sprint in openSprints() AND status = 'In Progress'" --fields "key,summary,status" --csv
```

**Format as:**
```
Done yesterday:
- KEY-101: Implemented login page
- KEY-102: Fixed navigation bug

Working on today:
- KEY-103: API endpoint refactor
- KEY-104: Code review for auth module

Blocked:
- (ask the user or note: none reported)
```

## My Tasks

**Search:**
```
acli jira workitem search --jql "assignee = currentUser() AND status != Done ORDER BY priority DESC, updated DESC" --fields "key,summary,status,priority" --csv
```

**Format as:** Group by status, show priority:
```
In Progress:
- KEY-103: API endpoint refactor (High)

To Do:
- KEY-105: Write unit tests (Medium)
- KEY-106: Update docs (Low)
```

## Workload Review

User provides the project key.

**Search:**
```
acli jira workitem search --jql "sprint in openSprints() AND project = 'PROJ'" --fields "key,summary,status,assignee" --csv
```

**Format as:** Group by assignee, count by status:
```
Alice: 3 In Progress, 1 To Do
Bob: 2 In Progress, 2 In Review
Unassigned: 4 To Do
```

## Error Handling

If ACLI returns exit code != 0:
- "authentication failed" -> Tell user: `acli jira auth login --web --site <site>.atlassian.net`
- "command not found: acli" -> Tell user: `brew tap atlassian/homebrew-acli && brew install acli`
- JQL syntax error -> Show error, suggest corrected syntax
- "trace id:" prefix -> Unexpected server error, report trace ID
- Other -> Report raw error message
