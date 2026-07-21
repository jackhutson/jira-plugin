# Workflow Discovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add on-demand per-project workflow discovery so `jira-progress` uses real Jira status names instead of hardcoded ones.

**Architecture:** New `config/workflows.json` file stores per-project status mappings and optional transition graphs. New `jira-workflow` skill handles discovery (auto-discover via ACLI search or Rovo prompt generation). `jira-progress` and `jira-work` are updated to read from config before transitioning.

**Tech Stack:** ACLI, skill markdown files, JSON config

---

### Task 1: Create the config directory and seed file

**Files:**
- Create: `config/workflows.json`

**Step 1: Create the config directory and empty seed file**

```bash
mkdir -p config
```

Write `config/workflows.json`:

```json
{
  "projects": {}
}
```

This is the empty seed. Projects are added on-demand during discovery.

**Step 2: Commit**

```bash
git add config/workflows.json
git commit -m "feat: add empty workflows config seed"
```

---

### Task 2: Create the `jira-workflow` skill

**Files:**
- Create: `skills/jira-workflow/SKILL.md`

**Step 1: Write the skill file**

Write `skills/jira-workflow/SKILL.md`:

```markdown
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
```

**Step 2: Commit**

```bash
git add skills/jira-workflow/SKILL.md
git commit -m "feat: add jira-workflow discovery skill"
```

---

### Task 3: Update `jira-progress` to use config

**Files:**
- Modify: `skills/jira-progress/SKILL.md`

**Step 1: Rewrite the skill to read from config**

Replace the entire contents of `skills/jira-progress/SKILL.md` with:

```markdown
---
name: jira-progress
description: >
  Use when work on a ticket has reached a stage boundary — started working,
  sent for review, completed, blocked, or reopened. Handles status transition,
  comment, and field updates in one pass.
---

# Update Ticket by Workflow Stage (ACLI)

Transitions a ticket's status and adds a meaningful comment describing what happened — all in one pass. The comment is the valuable part; a bare status change is cheap.

## Stages

| Stage | User says | Comment guidance |
|-------|-----------|-----------------|
| `start` | "start working on", "pick up" | What you're about to do |
| `review` | "send for review", "ready for review" | What was done, what to review |
| `done` | "mark as done", "complete", "finished" | Summary of what was accomplished |
| `block` | "blocked on", "stuck" | What the blocker is and who can unblock |
| `reopen` | "reopen", "needs more work" | Why it's being reopened |

## Procedure

1. **Determine the stage** from the user's intent using the table above
2. **Extract the project key** from the issue key (e.g., `PL-3718` → `PL`)
3. **Look up the project in `config/workflows.json`:**
   - Read the file at `config/workflows.json` (relative to the plugin root)
   - Check if `projects.PROJECT_KEY` exists
   - **If not found → invoke the `jira-workflow` skill** for this project. After it completes, re-read the config and continue.
4. **Resolve the stage to the actual Jira status** using `projects.PROJECT_KEY.statuses.STAGE`
5. **Validate the transition** (if `transitions` is configured for this project):
   - Get the ticket's current status: `acli jira workitem view KEY-123 --fields "status" --json`
   - Check if the target status is in the list of valid transitions from the current status
   - If not valid, report: "Can't transition from CURRENT to TARGET. Valid moves: [list]. You may need to transition through an intermediate status."
6. **Transition status:**
```
acli jira workitem transition --key "KEY-123" --status "RESOLVED_STATUS" --yes
```
7. **Add a comment** — compose from context, not a canned string:
```
acli jira workitem comment-create --key "KEY-123" --body "Started work on the API refactor — focusing on the auth endpoints first"
```
8. **Update fields** if relevant (e.g., claim assignee on `start`):
```
acli jira workitem edit --key "KEY-123" --assignee "user@email.com" --yes
```
9. **Confirm:** `KEY-123: PREVIOUS_STATUS → RESOLVED_STATUS | Comment added`

## Error Handling

If ACLI returns exit code != 0:
- "authentication failed" → Tell user: `acli jira auth login --web --site <site>.atlassian.net`
- "command not found: acli" → Tell user: `brew tap atlassian/homebrew-acli && brew install acli`
- Invalid status/transition → Report error. If transitions are configured, show valid moves. If not, suggest running `jira-workflow` with the Rovo path to capture the full transition graph.
- "trace id:" prefix → Unexpected server error, report trace ID
- Other → Report raw error message
```

**Step 2: Verify the diff looks correct**

```bash
git diff skills/jira-progress/SKILL.md
```

Expected: The stages table no longer has a "Status" column with hardcoded values. The procedure now has steps 2-5 for config lookup, stage resolution, and transition validation. The transition command uses `RESOLVED_STATUS` instead of a hardcoded name.

**Step 3: Commit**

```bash
git add skills/jira-progress/SKILL.md
git commit -m "feat: jira-progress reads status names from workflow config"
```

---

### Task 4: Update `jira-work` to use config

**Files:**
- Modify: `skills/jira-work/SKILL.md`

**Step 1: Update hardcoded status references**

In `skills/jira-work/SKILL.md`, replace all hardcoded status names with references to the workflow config. The changes are in three sections:

**In the CLAIM section (around line 21)**, change:
```
acli jira workitem transition --key "KEY-123" --status "In Progress" --yes
```
to:
```
acli jira workitem transition --key "KEY-123" --status "START_STATUS" --yes
```
And add above it:
```
Look up the project in `config/workflows.json` to resolve stage names to actual statuses.
If the project is not configured, invoke the `jira-workflow` skill first.
Use the `start` stage status for claiming.
```

**In the CHECKPOINT section (around line 56)**, change:
```
acli jira workitem transition --key "KEY-123" --status "Blocked" --yes
```
to:
```
acli jira workitem transition --key "KEY-123" --status "BLOCK_STATUS" --yes
```

**In the COMPLETE section (around line 73)**, change:
```
acli jira workitem transition --key "KEY-123" --status "Done" --yes
```
to:
```
acli jira workitem transition --key "KEY-123" --status "DONE_STATUS" --yes
```

The full updated file should read:

```markdown
---
name: jira-work
description: >
  Use when the user assigns a ticket to the agent, says "work on this ticket",
  "pick up this item", or wants the agent to claim a ticket and execute against
  it. Procedural harness that wraps any work with Jira discipline.
---

# Agent Works a Ticket (ACLI)

Procedural workflow that wraps any work the agent does with Jira discipline — claim at start, update when blocked, report at end. The skill defines WHEN to update Jira, not WHAT the work is.

## Status Resolution

Before any transition, look up the project in `config/workflows.json`:
1. Extract the project key from the issue key (e.g., `PL-3718` → `PL`)
2. Check if `projects.PROJECT_KEY` exists in the config
3. If not found → invoke the `jira-workflow` skill for this project, then re-read
4. Use the `statuses` mapping to resolve stage names (`start`, `block`, `done`) to actual Jira status names

## Procedure

### 1. CLAIM

Assign the ticket and signal that work is starting:

```
acli jira workitem assign --key "KEY-123" --assignee "user@email.com"
acli jira workitem transition --key "KEY-123" --status "START_STATUS" --yes
acli jira workitem comment-create --key "KEY-123" --body "Picked up by agent — starting work"
```

Where `START_STATUS` is resolved from `config/workflows.json` → `projects.PROJECT_KEY.statuses.start`.

If the ticket is already assigned to the current user, skip the assign step. If already in the start status, skip the transition.

### 2. CONTEXT

Load the full ticket context to understand what needs to be done:

```
acli jira workitem view KEY-123 --fields "key,summary,status,assignee,priority,issuetype,description" --json
acli jira workitem search --jql "parent = KEY-123" --fields "key,summary,status" --csv
acli jira workitem comment-list --key "KEY-123"
```

Parse from the description:
- Acceptance criteria or requirements
- Any linked resources or references
- Subtasks and their status

### 3. EXECUTE

Do the work described in the ticket. This is intentionally open — the work could be:
- Writing code (use appropriate development skills)
- Research and reporting back
- Creating a document
- Running a workflow from another skill

The skill defines the Jira checkpoints, not the work itself.

### 4. CHECKPOINT (during execution)

**If blocked:**
```
acli jira workitem transition --key "KEY-123" --status "BLOCK_STATUS" --yes
acli jira workitem comment-create --key "KEY-123" --body "Blocked: [describe the blocker]"
```

Where `BLOCK_STATUS` is resolved from `config/workflows.json` → `projects.PROJECT_KEY.statuses.block`.

Stop and report to the user.

**If a scope question arises:**
```
acli jira workitem comment-create --key "KEY-123" --body "Question: [the question]"
```
Ask the user before proceeding.

### 5. COMPLETE

When work is finished:

```
acli jira workitem comment-create --key "KEY-123" --body "Completed: [summary of what was done, what changed, any follow-ups]"
acli jira workitem transition --key "KEY-123" --status "DONE_STATUS" --yes
```

Where `DONE_STATUS` is resolved from `config/workflows.json` → `projects.PROJECT_KEY.statuses.done`.

If code was written, include the branch name or PR link in the completion comment.

The user can specify a preferred completion status (e.g., review instead of done). Resolve via the config mapping.

## Error Handling

If ACLI returns exit code != 0:
- "authentication failed" → Tell user: `acli jira auth login --web --site <site>.atlassian.net`
- "command not found: acli" → Tell user: `brew tap atlassian/homebrew-acli && brew install acli`
- "trace id:" prefix → Unexpected server error, report trace ID
- Transition failure → Check if transitions graph is configured. If so, report valid moves. If not, suggest Rovo discovery via `jira-workflow`.
- Other → Report raw error message
```

**Step 2: Verify the diff**

```bash
git diff skills/jira-work/SKILL.md
```

Expected: No hardcoded status names remain. All transitions reference config lookups. A new "Status Resolution" section appears at the top.

**Step 3: Commit**

```bash
git add skills/jira-work/SKILL.md
git commit -m "feat: jira-work reads status names from workflow config"
```

---

### Task 5: Update the entry router and agent

**Files:**
- Modify: `skills/jira/SKILL.md`
- Modify: `agents/jira-agent.md`

**Step 1: Add jira-workflow to the router**

In `skills/jira/SKILL.md`, add a new row to the Workflow Routing table:

```
| "Configure workflow for X", "set up statuses", "refresh workflow" | `jira-workflow` |
```

The full table should read:

```markdown
| User intent | Skill |
|---|---|
| "Show me ticket X", "pull context for X", "what's in X" | `jira-context` |
| "Start working on X", "mark X as done", "X is blocked", "send for review" | `jira-progress` |
| "Break this spec into tickets", "create tickets from this plan" | `jira-decompose` |
| "Work on X", "pick up X", "agent handle X" | `jira-work` |
| "Configure workflow for X", "set up statuses", "refresh workflow" | `jira-workflow` |
```

**Step 2: Add jira-workflow to the agent's skill list**

In `agents/jira-agent.md`, add to the skill list under "Core Responsibilities" item 2:

```
   - `jira-workflow` — discover and configure project workflow statuses
```

**Step 3: Commit**

```bash
git add skills/jira/SKILL.md agents/jira-agent.md
git commit -m "feat: add jira-workflow to router and agent skill list"
```

---

### Task 6: Manual smoke test

**Step 1: Verify config file is valid JSON**

```bash
python3 -c "import json; json.load(open('config/workflows.json')); print('Valid JSON')"
```

Expected: `Valid JSON`

**Step 2: Test auto-discover path manually**

Run the ACLI search that jira-workflow would use:

```bash
acli jira workitem search --jql "project = PL ORDER BY status" --fields "key,status" --csv
```

Expected: CSV output with Key and Status columns. Verify unique statuses can be collected from it.

**Step 3: Verify all skills reference config correctly**

Search for any remaining hardcoded status names across skills:

```bash
grep -r "In Progress\|In Review\|To Do" skills/
```

Expected: No matches (all hardcoded status names have been replaced with config references).

**Step 4: Commit test results (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during smoke test"
```
