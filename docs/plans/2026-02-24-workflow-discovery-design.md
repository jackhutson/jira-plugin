# Workflow Discovery & Configuration — Design Document

**Date:** 2026-02-24
**Status:** Draft
**Builds on:** 2026-02-18-jira-workflow-skills-design.md

---

## Problem

`jira-progress` hardcodes status names ("In Progress", "In Review", "Done", "Blocked", "To Do") but actual Jira status names are project-specific and instance-specific. Real statuses observed on this instance include "IN PROGRESS", "VERIFY", "TODO", "DONE", "READY FOR DEVELOPMENT", "Backlog" — none of which match the hardcoded values. Transitions fail silently or with opaque errors.

A secondary issue: without knowing the valid transition graph, we can't tell the user "you can't go from TODO to DONE directly" or automatically chain intermediate transitions.

## Solution

On-demand workflow discovery per project, cached in `config/workflows.json`. When `jira-progress` is invoked for a project not yet configured, it pauses to discover and map statuses before proceeding. Two discovery paths: automated (ACLI search + best-guess mapping) or Rovo-assisted (generated prompt the user pastes into their Rovo AI chat).

---

## Config File: `config/workflows.json`

```json
{
  "projects": {
    "PL": {
      "statuses": {
        "start": "IN PROGRESS",
        "review": "VERIFY",
        "done": "DONE",
        "block": "Blocked",
        "reopen": "TODO"
      },
      "transitions": {
        "Backlog": ["TODO", "IN PROGRESS"],
        "TODO": ["IN PROGRESS", "Blocked"],
        "IN PROGRESS": ["VERIFY", "DONE", "Blocked", "TODO"],
        "VERIFY": ["DONE", "IN PROGRESS", "TODO"],
        "DONE": ["TODO"],
        "Blocked": ["TODO", "IN PROGRESS"]
      }
    }
  }
}
```

- `statuses` — maps our stage names to the project's actual Jira status names
- `transitions` — maps each status to its valid target statuses (the workflow graph)
- Per-project. No "default" block — every project is explicitly configured on first use.

---

## Discovery Flow

When `jira-progress` is invoked for a project not in `config/workflows.json`:

### Step 1: Pause and offer discovery paths

```
Project "PL" doesn't have workflow statuses configured yet.
I can set this up two ways:

A) Auto-discover — I'll search for statuses in PL and propose a mapping
B) Rovo prompt — I'll give you a prompt to paste into Rovo for the full workflow definition

Which do you prefer?
```

### Step 2A: Auto-discover

1. Run: `acli jira workitem search --jql "project = PL" --fields "key,status" --csv`
2. Collect unique status values
3. Propose a best-guess mapping using string similarity:
   - Statuses containing "progress" → `start`
   - Statuses containing "review" or "verify" or "qa" → `review`
   - Statuses containing "done" or "complete" or "closed" → `done`
   - Statuses containing "block" → `block`
   - Statuses containing "todo" or "to do" or "open" or "backlog" or "ready" → `reopen`
4. Present to user for confirmation:

```
Found these statuses in PL: Backlog, TODO, IN PROGRESS, VERIFY, DONE, Blocked

Proposed mapping:
  start  → IN PROGRESS
  review → VERIFY
  done   → DONE
  block  → Blocked
  reopen → TODO
  (unmapped: Backlog)

Look right? You can adjust any of these.
```

5. User confirms or adjusts
6. Write to `config/workflows.json`
7. Note: auto-discover captures statuses but NOT the transition graph (ACLI can't query that). Transitions are left empty and filled in reactively if a transition fails, or via path 2B.

### Step 2B: Rovo prompt

Generate and display a prompt for the user to paste into their Jira Rovo AI chat:

```
Paste this into Rovo:

---
For project PL (Platform), give me:

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

User pastes Rovo's response back. The skill parses the JSON and writes to `config/workflows.json`. This path captures the full transition graph and any required fields.

---

## Changes to `jira-progress`

Current procedure:
1. Determine stage from user intent
2. Transition with hardcoded status name
3. Add comment

New procedure:
1. Determine stage from user intent
2. Extract project key from issue key
3. **Look up `config/workflows.json` for this project**
4. **If not found → trigger discovery flow (above), then resume**
5. **Resolve stage name to actual Jira status via the mapping**
6. **(Optional) If transitions are configured, validate the move is legal. If not, report which moves are available from the current status.**
7. Transition with the resolved status name
8. Add comment

---

## New Skill: `jira-workflow`

A small skill that handles the discovery flow. Can be invoked:
- Automatically by `jira-progress` when a project is missing from config
- Manually by the user: "set up workflow for project X" or "refresh workflow for PL"

**Trigger phrases:** "configure workflow", "set up statuses", "refresh workflow for X"

---

## Error Handling

- **Transition fails after mapping** — Report the error. If transitions graph is configured, suggest valid moves. If not, suggest running Rovo discovery to get the full graph.
- **Status name not in mapping** — The ticket is in a status our stages don't cover. Report it and suggest updating the config.
- **Config file missing or malformed** — Treat as "project not configured" and trigger discovery.

---

## What This Doesn't Solve

- **Resolution field** — Confirmed not required on this instance (AS-1442 is DONE with null resolution). If Rovo discovery reveals it's required for other projects, the `required_fields` section captures that for future handling.
- **Multi-workflow projects** — Some projects may use different workflows for different issue types (Bug vs Story). The current design maps one workflow per project. This is a known simplification; cross that bridge if it becomes a problem.
