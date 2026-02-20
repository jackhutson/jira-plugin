---
name: jira-decompose
description: >
  Use when the user has a spec, architecture doc, implementation plan, or
  feature description and wants to break it into Jira tickets for distribution
  to people or agents. Also triggered by "create tickets from this plan" or
  "file tickets for this spec".
---

# Spec to Tickets (ACLI)

Reads a source document, proposes a ticket hierarchy, gets user approval, then creates all tickets with proper parent/child relationships.

## Procedure

### 1. Read the Source

Accept input as:
- A file path (read the file)
- Inline text (use directly)
- A reference to something already in conversation context

### 2. Propose the Breakdown

Analyze the document and propose a hierarchy — one epic for the overall effort, stories/tasks as children scoped to independently deliverable chunks.

Each ticket gets: summary, description with acceptance criteria, suggested assignee if mentioned in the source.

Present for approval:

```
Proposed breakdown for "Auth System Redesign":

Epic: AUTH-??? "Auth System Redesign"
├── Task: "Migrate session store to Redis" — assignee: alice@...
├── Task: "Implement JWT refresh flow" — assignee: bob@...
├── Task: "Add rate limiting to auth endpoints" — unassigned
└── Task: "Update auth integration tests" — unassigned

Create these 5 tickets? (You can adjust before I create them)
```

**Always propose before creating.** Bulk ticket creation is hard to undo. Wait for explicit user approval.

### 3. Create Tickets

On approval, create in order:

**Epic first:**
```
acli jira workitem create --summary "Epic title" --project "PROJ" --type "Epic" --description "..." --yes
```

**Children with parent linkage:**
```
acli jira workitem create --summary "Task title" --project "PROJ" --type "Task" --parent "EPIC-KEY" --description "..." --assignee "user@email.com" --yes
```

Repeat for each child ticket. Capture the returned key for each.

### 4. Return Summary

```
Created 5 tickets in PROJ:

| Key | Summary | Type | Assignee |
|-----|---------|------|----------|
| PROJ-100 | Auth System Redesign | Epic | — |
| PROJ-101 | Migrate session store to Redis | Task | alice@... |
| PROJ-102 | Implement JWT refresh flow | Task | bob@... |
| PROJ-103 | Add rate limiting to auth endpoints | Task | unassigned |
| PROJ-104 | Update auth integration tests | Task | unassigned |
```

## Error Handling

If ACLI returns exit code != 0:
- "authentication failed" → Tell user: `acli jira auth login --web --site <site>.atlassian.net`
- "command not found: acli" → Tell user: `brew tap atlassian/homebrew-acli && brew install acli`
- "trace id:" prefix → Unexpected server error, report trace ID
- If a child ticket fails to create, report which ones succeeded and which failed — don't roll back the ones that worked
- Other → Report raw error message
