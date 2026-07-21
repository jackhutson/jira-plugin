---
name: jira-workflow
description: >
  Use when a project's workflow statuses need to be configured for the first
  time, or refreshed. Triggered automatically by jira-progress when a project
  is missing from persistent configuration, or manually via "configure workflow",
  "set up statuses for X", "refresh workflow for X".
---

# Workflow Discovery (ACLI)

Discovers a project's Jira statuses and maps them to stage names used by
jira-progress. Results are stored persistently by Jira site and project through
the shared runtime helper.

This workflow reads Jira and changes only plugin-local configuration. If its
discovery leads to a Jira mutation, first read and apply
`${CLAUDE_PLUGIN_ROOT}/docs/mutation-safety.md`.

## Persistent Configuration

Determine the exact authenticated Jira site hostname before reading or writing
configuration. Use the site reported by the SessionStart context when present;
otherwise run the shared helper's `doctor --json`. If `data.sites` has more than
one entry and the target is ambiguous, ask the user which site to use. Never
infer a site from a project key.

All configuration access goes through the helper interface:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/jira-plugin.mjs" config get --site "SITE" --project "PROJECT_KEY" --json
```

`CONFIG_NOT_FOUND` means that site/project pair is not configured. On any other
error, show the helper's `message` and stop.

## Procedure

### 1. Offer discovery paths

Present to the user:

```
Project "PROJECT_KEY" doesn't have workflow statuses configured yet.
I can set this up two ways:

A) Auto-discover — I'll search for statuses in PROJECT_KEY and propose a mapping
   (quick, but won't capture transition rules)
B) Rovo prompt — I'll give you a prompt to paste into Rovo AI for the complete
   workflow including transitions and required fields (more accurate)

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

5. After the user confirms or adjusts, save a project object with `statuses`
   only (no `transitions` — auto-discover cannot get those):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/jira-plugin.mjs" config set --site "SITE" --project "PROJECT_KEY" --from-json - --json <<'JSON'
{
  "statuses": {
    "start": "IN PROGRESS",
    "review": "VERIFY",
    "done": "DONE",
    "block": "Blocked",
    "reopen": "TODO"
  }
}
JSON
```

Add `--default` to this same command only when the user also confirmed this is
the site's default project for resolving bare ticket numbers. The helper
validates the object and commits the project/default change atomically.


### 2B. Rovo prompt

1. Find a ticket key in the target project to anchor the prompt:
```
acli jira workitem search --jql "project = PROJECT_KEY ORDER BY created DESC" --fields "key" --limit 1 --json
```

Extract the key (e.g., `PROJECT_KEY-123`).

2. Generate and display this prompt for the user to paste into their Jira Rovo AI chat:

```
Paste this into Rovo:

---
Please provide the complete workflow for PROJECT_KEY-123 ticket.

Format the workflow as JSON with this structure:
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

For the "statuses" mapping, assign each project status to the closest match:
- start = the status for active work (e.g., "In Progress")
- review = the status for code/peer review (e.g., "In Review")
- done = the terminal completed status (e.g., "Done")
- block = the blocked/impediment status (e.g., "Blocked")
- reopen = the status for returning work to the queue (e.g., "Reopened", "To Do")
---
```

Replace `PROJECT_KEY-123` with the actual ticket key found in step 1.

3. When the user pastes Rovo's response back:
   - Parse the JSON from the response (handle markdown code fences if present)
   - Validate that `statuses` contains at least `start` and `done` mappings
   - Keep `workflow_name`, `statuses`, `transitions`, and `required_fields` (when present) as the project object
   - Pipe that object to the helper's `config set` command shown above

To make a configured project the default for bare ticket numbers on this site:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/jira-plugin.mjs" config set --site "SITE" --project "PROJECT_KEY" --from-json - --default --json
```

Pipe the same confirmed project object to this command. The helper hides where
the site-level default and project configuration are stored.

### 3. Confirm

After either path completes:
```
Workflow configured for PROJECT_KEY on SITE. Statuses saved in persistent plugin data.
```

If this was triggered by jira-progress, tell the agent to resume the original transition.

## Error Handling

- ACLI search returns no results → "No issues found in PROJECT_KEY. Is the project key correct?"
- User provides invalid JSON from Rovo → "Couldn't parse that JSON. Can you paste just the JSON block from Rovo's response?"
- Helper error → Show its stable `message` and stop; never inspect or repair its storage directly
