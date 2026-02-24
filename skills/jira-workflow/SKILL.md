---
name: jira-workflow
description: >
  Use when a project's workflow statuses need to be configured for the first
  time, or refreshed. Triggered automatically by jira-progress when a project
  is missing from config/workflows.json, or manually via "configure workflow",
  "set up statuses for X", "refresh workflow for X".
---

# Workflow Discovery (ACLI)

Discovers a project's Jira statuses and maps them to stage names used by jira-progress. Results are cached in `config/workflows.json` so this only runs once per project.

## Procedure

### 1. Offer discovery paths

Present to the user:

```
Project "PROJECT_KEY" doesn't have workflow statuses configured yet.
I can set this up two ways:

A) Auto-discover — I'll search for statuses in PROJECT_KEY and propose a mapping
B) Rovo prompt — I'll give you a prompt to paste into Rovo for the full workflow definition

Which do you prefer?
```

### 2A. Auto-discover

1. Search for statuses currently in use:
```
acli jira workitem search --jql "project = PROJECT_KEY ORDER BY status" --fields "key,status" --csv
```

2. Collect unique status values from the output.

3. Propose a best-guess mapping using these rules (case-insensitive):
   - Contains "progress" → `start`
   - Contains "review" or "verify" or "qa" → `review`
   - Contains "done" or "complete" or "closed" → `done`
   - Contains "block" → `block`
   - Contains "todo" or "to do" or "open" or "ready" → `reopen`
   - Anything else → listed as unmapped

4. Present the mapping to the user:
```
Found these statuses in PROJECT_KEY: Backlog, TODO, IN PROGRESS, VERIFY, DONE, Blocked

Proposed mapping:
  start  → IN PROGRESS
  review → VERIFY
  done   → DONE
  block  → Blocked
  reopen → TODO
  (unmapped: Backlog)

Look right? You can adjust any of these.
```

5. After user confirms or adjusts, read `config/workflows.json`, add the project entry with `statuses` only (no `transitions` — auto-discover can't get those), and write the file back.

Example entry added:
```json
{
  "PROJECT_KEY": {
    "statuses": {
      "start": "IN PROGRESS",
      "review": "VERIFY",
      "done": "DONE",
      "block": "Blocked",
      "reopen": "TODO"
    }
  }
}
```

### 2B. Rovo prompt

Generate and display this prompt for the user to paste into their Jira Rovo AI chat. Replace PROJECT_KEY and PROJECT_NAME with the actual values (get project name from `acli jira project view --key "PROJECT_KEY" --json`):

```
Paste this into Rovo:

---
For project PROJECT_KEY (PROJECT_NAME), give me:

1. The name of the workflow(s) used by this project
2. All statuses in each workflow
3. The valid transitions between statuses — for each status, list which
   statuses it can transition to
4. For each status, map it to the closest match from this list:
   start, review, done, block, reopen
5. Are any fields required when transitioning to terminal statuses
   (e.g., resolution field when moving to Done)?

Format the answer as JSON like this:
{
  "workflow_name": "...",
  "statuses": {
    "start": "STATUS_NAME",
    "review": "STATUS_NAME",
    "done": "STATUS_NAME",
    "block": "STATUS_NAME",
    "reopen": "STATUS_NAME"
  },
  "transitions": {
    "STATUS_A": ["STATUS_B", "STATUS_C"],
    "STATUS_B": ["STATUS_C", "STATUS_D"]
  },
  "required_fields": {
    "DONE": ["resolution"]
  }
}
---
```

When the user pastes Rovo's response back:

1. Parse the JSON from the response (handle markdown code fences if present)
2. Read `config/workflows.json`
3. Add the project entry with `statuses`, `transitions`, and `required_fields` (if any)
4. Write the file back

### 3. Confirm

After either path completes:
```
Workflow configured for PROJECT_KEY. Statuses saved to config/workflows.json.
```

If this was triggered by jira-progress, tell the agent to resume the original transition.

## Error Handling

- ACLI search returns no results → "No issues found in PROJECT_KEY. Is the project key correct?"
- User provides invalid JSON from Rovo → "Couldn't parse that JSON. Can you paste just the JSON block from Rovo's response?"
- Config file missing or malformed → Create a fresh `{"projects": {}}` and proceed
