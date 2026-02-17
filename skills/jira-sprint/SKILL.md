---
name: jira-sprint
description: >
  Use when the user asks about the current sprint, sprint issues, board
  information, sprint status, what's in the sprint, or sprint velocity.
  Covers board and sprint operations via ACLI.
---

# Jira Sprint & Board Operations (ACLI)

## Commands

**List boards:**
```
acli jira board list
```

**List sprints for a board:**
```
acli jira board list-sprints --board BOARD-ID
```

**List work items in a sprint:**
```
acli jira sprint list-workitems SPRINT-ID --fields "key,summary,status,assignee,priority" --json
```

## Multi-Step Pattern: Current Sprint Issues

Board/sprint discovery is a multi-step chain:

1. **Find the board:** `acli jira board list` — identify the board ID for the project
2. **List sprints:** `acli jira board list-sprints --board BOARD-ID` — find the active sprint ID
3. **Get sprint issues:** `acli jira sprint list-workitems SPRINT-ID --fields "key,summary,status,assignee" --json`

This multi-step chain is ideal for subagent mode — the agent handles all steps internally and returns only the final result.

## JQL Alternative

For simpler sprint queries, use JQL via the jira-search skill:
```
sprint in openSprints() AND project = "PROJ"
```

This is a single command but provides less sprint metadata than the board/sprint chain.

## Error Handling

If ACLI returns exit code != 0:
- "authentication failed" -> Tell user: `acli jira auth login --web --site <site>.atlassian.net`
- "command not found: acli" -> Tell user: `brew tap atlassian/homebrew-acli && brew install acli`
- "trace id:" prefix -> Unexpected server error, report trace ID
- Other -> Report raw error message

## Related Skills

- **jira-search**: JQL-based sprint queries (`sprint in openSprints()`)
