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

Present for approval (include story point estimates):

```
Proposed breakdown for "Auth System Redesign":

Epic: AUTH-??? "Auth System Redesign"
├── Task: "Migrate session store to Redis" — assignee: alice@... (3 pts)
├── Task: "Implement JWT refresh flow" — assignee: bob@... (5 pts)
├── Task: "Add rate limiting to auth endpoints" — unassigned (2 pts)
└── Task: "Update auth integration tests" — unassigned (1 pt)

Create these 5 tickets? (You can adjust summaries, assignees, and story points before I create them)
```

If the user doesn't provide estimates, default all story points to 0 (avoids null values cluttering sprint planning).

**Always propose before creating.** Bulk ticket creation is hard to undo. Wait for explicit user approval.

### 3. Create Tickets

On approval, create in order using `--from-json` to support story points and custom fields.

**Discover the story points field ID first** (only needed once per project):
```
acli jira workitem search --jql "project = PROJ AND 'Story Points' is not EMPTY" --fields "key" --limit 1 --json
acli jira workitem view PROJ-NNN --fields "*all" --json | jq -r '.fields | to_entries[] | select(.value != null and (.value | type == "number")) | "\(.key): \(.value)"'
```
Look for a `customfield_*` with a numeric value matching known story points. Common IDs: `customfield_10020`, `customfield_10003`.

**Epic first:**
```bash
cat > /tmp/jira-create.json << 'EOF'
{
  "summary": "Epic title",
  "projectKey": "PROJ",
  "type": "Epic",
  "description": {
    "type": "doc", "version": 1,
    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Description here"}]}]
  }
}
EOF
acli jira workitem create --from-json /tmp/jira-create.json --json
```

Capture the returned key (e.g., `PROJ-100`).

**Children with parent linkage and story points:**
```bash
cat > /tmp/jira-create.json << 'EOF'
{
  "summary": "Task title",
  "projectKey": "PROJ",
  "type": "Task",
  "parentIssueId": "PROJ-100",
  "assignee": "user@email.com",
  "description": {
    "type": "doc", "version": 1,
    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Acceptance criteria here"}]}]
  },
  "additionalAttributes": {
    "customfield_10020": 3
  }
}
EOF
acli jira workitem create --from-json /tmp/jira-create.json --json
```

Repeat for each child ticket. Set story points in `additionalAttributes` using the discovered field ID. Default to `0` if no estimate provided.

**Note:** Story points can only be set at creation time. The `edit --from-json` schema does not support `additionalAttributes`. If story points need to change later, they must be updated in the Jira web UI.

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
- **After any error:** If you have already retried once, stop and report the error to the user. Do not attempt alternative approaches or workarounds.
