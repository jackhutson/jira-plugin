# Jira Workflow Skills Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace 5 API-shaped atomic skills with 4 user-facing workflow skills, update the entry router and subagent.

**Architecture:** Delete atomic skills (jira-issue, jira-search, jira-transition, jira-sprint, jira-planning). Create 4 workflow skills (jira-context, jira-progress, jira-decompose, jira-work) with ACLI commands inlined. Update entry router routing table and subagent examples.

**Tech Stack:** Markdown skills with YAML frontmatter, ACLI bash commands, Claude Code plugin format.

**Design doc:** `docs/plans/2026-02-18-jira-workflow-skills-design.md`

---

### Task 1: Delete Atomic Skills

**Files:**
- Delete: `skills/jira-issue/SKILL.md`
- Delete: `skills/jira-search/SKILL.md`
- Delete: `skills/jira-transition/SKILL.md`
- Delete: `skills/jira-sprint/SKILL.md`
- Delete: `skills/jira-planning/SKILL.md`

**Step 1: Remove all 5 atomic skill directories**

```bash
rm -rf skills/jira-issue skills/jira-search skills/jira-transition skills/jira-sprint skills/jira-planning
```

**Step 2: Verify only `skills/jira/` remains**

```bash
ls skills/
```

Expected: only `jira/` directory.

**Step 3: Commit**

```bash
git add -A skills/ && git commit -m "refactor: remove atomic skills (replaced by workflow skills)"
```

**Dependencies:** None. Do this first so subsequent tasks create into a clean directory.

---

### Task 2: Create `jira-context` Skill

**Files:**
- Create: `skills/jira-context/SKILL.md`

**Step 1: Create directory**

```bash
mkdir -p skills/jira-context
```

**Step 2: Write the skill file**

Create `skills/jira-context/SKILL.md` with this exact content:

```markdown
---
name: jira-context
description: >
  Use when needing to understand a Jira ticket before acting on it — pulling
  context for an agent, reviewing a ticket's full picture, loading ticket
  details for decision-making, or when asked to "show me" or "what's in" a ticket.
---

# Pull Ticket Context (ACLI)

Fetches a ticket and its full picture — subtasks, comments, linked context — and packages it as a structured block for agent or human consumption.

## Procedure

1. **Fetch the target ticket** (full fields including description):
```
acli jira workitem view KEY-123 --fields "key,summary,status,assignee,priority,issuetype,description" --json
```

2. **Fetch subtasks:**
```
acli jira workitem search --jql "parent = KEY-123" --fields "key,summary,status" --csv
```

3. **Fetch recent comments:**
```
acli jira workitem comment-list --key "KEY-123"
```

4. **Package as structured context:**

```
## KEY-123: "Title"
Status: In Progress | Priority: High | Assignee: user@email.com
Type: Story | Sprint: Sprint 42

### Description
[full description text]

### Subtasks
- KEY-124: "Subtask A" [Done]
- KEY-125: "Subtask B" [In Progress]

### Recent Comments (last 5)
- Alice (2d ago): "Blocked on API access"
- Bob (1d ago): "Unblocked, credentials shared"
```

Always use this output format. Downstream skills depend on its structure.

If the ticket has no subtasks or comments, omit those sections rather than showing empty headings.

## Error Handling

If ACLI returns exit code != 0:
- "authentication failed" → Tell user: `acli jira auth login --web --site <site>.atlassian.net`
- "command not found: acli" → Tell user: `brew tap atlassian/homebrew-acli && brew install acli`
- "trace id:" prefix → Unexpected server error, report trace ID
- Other → Report raw error message
```

**Step 3: Verify YAML frontmatter**

```bash
head -7 skills/jira-context/SKILL.md
```

Expected: starts with `---`, has `name: jira-context`, has `description:`, ends with `---`.

**Step 4: Commit**

```bash
git add skills/jira-context/ && git commit -m "feat: add jira-context workflow skill"
```

**Dependencies:** Task 1 (clean directory).

---

### Task 3: Create `jira-progress` Skill

**Files:**
- Create: `skills/jira-progress/SKILL.md`

**Step 1: Create directory**

```bash
mkdir -p skills/jira-progress
```

**Step 2: Write the skill file**

Create `skills/jira-progress/SKILL.md` with this exact content:

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

| Stage | User says | Status | Comment guidance |
|-------|-----------|--------|-----------------|
| `start` | "start working on", "pick up" | → In Progress | What you're about to do |
| `review` | "send for review", "ready for review" | → In Review | What was done, what to review |
| `done` | "mark as done", "complete", "finished" | → Done | Summary of what was accomplished |
| `block` | "blocked on", "stuck" | → Blocked | What the blocker is and who can unblock |
| `reopen` | "reopen", "needs more work" | → To Do | Why it's being reopened |

## Procedure

1. **Determine the stage** from the user's intent using the table above
2. **Transition status:**
```
acli jira workitem transition --key "KEY-123" --status "In Progress" --yes
```
3. **Add a comment** — compose from context, not a canned string:
```
acli jira workitem comment-create --key "KEY-123" --body "Started work on the API refactor — focusing on the auth endpoints first"
```
4. **Update fields** if relevant (e.g., claim assignee on `start`):
```
acli jira workitem edit --key "KEY-123" --assignee "user@email.com" --yes
```
5. **Confirm:** `KEY-123: To Do → In Progress | Comment added`

Status names are project-specific. If a transition fails, report the error — the status name may differ in the user's workflow.

## Error Handling

If ACLI returns exit code != 0:
- "authentication failed" → Tell user: `acli jira auth login --web --site <site>.atlassian.net`
- "command not found: acli" → Tell user: `brew tap atlassian/homebrew-acli && brew install acli`
- Invalid status/transition → Report error, suggest checking available statuses
- "trace id:" prefix → Unexpected server error, report trace ID
- Other → Report raw error message
```

**Step 3: Verify YAML frontmatter**

```bash
head -7 skills/jira-progress/SKILL.md
```

Expected: starts with `---`, has `name: jira-progress`, has `description:`, ends with `---`.

**Step 4: Commit**

```bash
git add skills/jira-progress/ && git commit -m "feat: add jira-progress workflow skill"
```

**Dependencies:** Task 1.

---

### Task 4: Create `jira-decompose` Skill

**Files:**
- Create: `skills/jira-decompose/SKILL.md`

**Step 1: Create directory**

```bash
mkdir -p skills/jira-decompose
```

**Step 2: Write the skill file**

Create `skills/jira-decompose/SKILL.md` with this exact content:

```markdown
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
```

**Step 3: Verify YAML frontmatter**

```bash
head -7 skills/jira-decompose/SKILL.md
```

Expected: starts with `---`, has `name: jira-decompose`, has `description:`, ends with `---`.

**Step 4: Commit**

```bash
git add skills/jira-decompose/ && git commit -m "feat: add jira-decompose workflow skill"
```

**Dependencies:** Task 1.

---

### Task 5: Create `jira-work` Skill

**Files:**
- Create: `skills/jira-work/SKILL.md`

**Step 1: Create directory**

```bash
mkdir -p skills/jira-work
```

**Step 2: Write the skill file**

Create `skills/jira-work/SKILL.md` with this exact content:

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

## Procedure

### 1. CLAIM

Assign the ticket and signal that work is starting:

```
acli jira workitem assign --key "KEY-123" --assignee "user@email.com"
acli jira workitem transition --key "KEY-123" --status "In Progress" --yes
acli jira workitem comment-create --key "KEY-123" --body "Picked up by agent — starting work"
```

If the ticket is already assigned to the current user, skip the assign step. If already In Progress, skip the transition.

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
acli jira workitem transition --key "KEY-123" --status "Blocked" --yes
acli jira workitem comment-create --key "KEY-123" --body "Blocked: [describe the blocker]"
```
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
acli jira workitem transition --key "KEY-123" --status "Done" --yes
```

If code was written, include the branch name or PR link in the completion comment.

The user can specify a preferred completion status (e.g., "In Review" instead of "Done"). Default to "Done" unless told otherwise.

## Error Handling

If ACLI returns exit code != 0:
- "authentication failed" → Tell user: `acli jira auth login --web --site <site>.atlassian.net`
- "command not found: acli" → Tell user: `brew tap atlassian/homebrew-acli && brew install acli`
- "trace id:" prefix → Unexpected server error, report trace ID
- Transition failure → Status name may differ in user's workflow, report and ask
- Other → Report raw error message
```

**Step 3: Verify YAML frontmatter**

```bash
head -7 skills/jira-work/SKILL.md
```

Expected: starts with `---`, has `name: jira-work`, has `description:`, ends with `---`.

**Step 4: Commit**

```bash
git add skills/jira-work/ && git commit -m "feat: add jira-work workflow skill"
```

**Dependencies:** Task 1.

---

### Task 6: Update Entry Router

**Files:**
- Modify: `skills/jira/SKILL.md`

**Step 1: Rewrite the entry skill**

Replace the entire content of `skills/jira/SKILL.md` with:

```markdown
---
name: jira
description: >
  Use when the user mentions Jira, issues, tickets, sprints, work items,
  or any project management task involving Atlassian. Routes to workflow
  skills or delegates to jira-agent subagent.
---

# Jira CLI Plugin (ACLI)

## Prereq Check (First Use Per Session)

Run via bash:
```
acli jira auth status
```

- **If auth fails:** Tell the user to run: `acli jira auth login --web --site <site>.atlassian.net`
- **If acli not found:** Tell the user to run: `brew tap atlassian/homebrew-acli && brew install acli`
- Do NOT automate auth — just check and inform.

## Mode Selection (First Jira Invocation Per Session)

Present two options to the user:

- **Direct mode:** "I'll run ACLI commands directly. Faster per-operation but output accumulates in our conversation. Best for a few quick operations."
- **Subagent mode:** "I'll delegate to a Jira specialist agent in a separate context. Slightly slower per-operation but keeps our conversation clean. Best for bulk work or many operations."

Remember the user's choice for the rest of the session. The user can say "switch to direct/subagent" to change mid-session.

## Workflow Routing

| User intent | Skill |
|---|---|
| "Show me ticket X", "pull context for X", "what's in X" | `jira-context` |
| "Start working on X", "mark X as done", "X is blocked", "send for review" | `jira-progress` |
| "Break this spec into tickets", "create tickets from this plan" | `jira-decompose` |
| "Work on X", "pick up X", "agent handle X" | `jira-work` |

## Ad-hoc Operations

For intents that don't match a workflow (e.g., "just create a blank ticket", "search for bugs in PROJ", "delete PROJ-99"), handle directly using ACLI:

- **Create:** `acli jira workitem create --summary "..." --project "PROJ" --type "Task" --yes`
- **Search:** `acli jira workitem search --jql "..." --fields "key,summary,status,assignee" --csv`
- **Edit:** `acli jira workitem edit --key "KEY-123" --summary "..." --yes`
- **Delete:** `acli jira workitem delete --key "KEY-123" --yes`

Always use `--yes` to skip confirmations and `--fields` to control output size.

## Direct Mode

1. Invoke the relevant workflow skill or run ad-hoc ACLI commands
2. Present results to the user

## Subagent Mode

1. Spawn `jira-agent` via the Task tool with the user's request
2. The agent loads workflow skills and executes ACLI commands
3. Present the agent's compact summary to the user
```

**Step 2: Verify YAML frontmatter**

```bash
head -7 skills/jira/SKILL.md
```

Expected: starts with `---`, has `name: jira`, has `description:`, ends with `---`.

**Step 3: Commit**

```bash
git add skills/jira/SKILL.md && git commit -m "refactor: update entry router for workflow skills"
```

**Dependencies:** Tasks 2-5 (all workflow skills exist for routing table to reference).

---

### Task 7: Update Subagent

**Files:**
- Modify: `agents/jira-agent.md`

**Step 1: Rewrite the subagent**

Replace the entire content of `agents/jira-agent.md` with:

```markdown
---
name: jira-agent
description: |
  Use this agent when the main agent needs to perform Jira operations in an isolated context — pulling ticket context, updating ticket progress, decomposing specs into tickets, or working a ticket end-to-end. Examples:

  <example>
  Context: User wants full context on a ticket
  user: "Pull up PROJ-123 with all the details"
  assistant: "I'll use the jira-agent to pull the full ticket context."
  <commentary>
  Full ticket context request triggers jira-agent delegation.
  </commentary>
  </example>

  <example>
  Context: User wants to update a ticket's status with context
  user: "Mark PROJ-456 as done — we shipped the API changes"
  assistant: "I'll use the jira-agent to update that ticket."
  <commentary>
  Stage-based progress update triggers jira-agent delegation.
  </commentary>
  </example>

  <example>
  Context: User wants to create tickets from a spec
  user: "Break down the auth redesign spec into Jira tickets"
  assistant: "I'll use the jira-agent to decompose that spec into tickets."
  <commentary>
  Spec decomposition triggers jira-agent delegation.
  </commentary>
  </example>

  <example>
  Context: User wants the agent to work a ticket
  user: "Pick up PROJ-789 and start working on it"
  assistant: "I'll use the jira-agent to claim and work that ticket."
  <commentary>
  Ticket-driven work triggers jira-agent delegation.
  </commentary>
  </example>

model: inherit
color: green
---

You are a Jira operations specialist that executes Atlassian CLI (acli) commands and returns concise, structured results to the main agent.

**Core Responsibilities:**

1. Execute ACLI commands via bash for all Jira operations
2. Use the Skill tool to load the appropriate workflow skill:
   - `jira-context` — pull full ticket context (view + subtasks + comments)
   - `jira-progress` — update ticket by workflow stage (transition + comment + fields)
   - `jira-decompose` — break a spec into tickets (propose → approve → create)
   - `jira-work` — claim a ticket and work it end-to-end
3. For ad-hoc operations not covered by a workflow, use ACLI directly
4. Execute multi-step chains internally and return only the final result
5. Always use `--yes` to skip interactive confirmations
6. Always use `--fields` to control output verbosity

**Output Formatting:**

- **Ticket context:** Use the structured format from jira-context (headings, subtasks, comments)
- **Progress updates:** `KEY-123: To Do → In Progress | Comment added`
- **Decomposition:** Summary table of created tickets with keys, summaries, types, assignees
- **Search results:** Compact table — key | summary | status | assignee
- **Create/edit:** One-line confirmation, e.g. `Created KEY-124: "Title" in Project`
- **Errors:** Clear message + suggested fix

**Error Handling:**

- **Auth failure:** `"Not authenticated. Run: acli jira auth login --web --site <your-site>.atlassian.net"`
- **ACLI not found:** `"ACLI not installed. Run: brew tap atlassian/homebrew-acli && brew install acli"`
- **JQL syntax error:** Show the error message, suggest corrected JQL
- **Permission denied:** Report clearly, suggest checking Jira permissions
- **Server error (trace id):** Report the trace ID for support

**Process:**

1. Parse the incoming request to determine the operation type
2. Load the relevant workflow skill using the Skill tool (or handle ad-hoc directly)
3. Execute the ACLI command(s) via bash following the skill's guidance
4. Format the result according to the output rules above
5. Return the formatted result to the main agent
```

**Step 2: Verify YAML frontmatter**

```bash
head -5 agents/jira-agent.md
```

Expected: starts with `---`, has `name: jira-agent`, has `description: |`.

**Step 3: Commit**

```bash
git add agents/jira-agent.md && git commit -m "refactor: update jira-agent for workflow skills"
```

**Dependencies:** Tasks 2-5 (workflow skills exist for skill list to reference).

---

### Task 8: Integration Verification

**Files:** None created or modified.

**Step 1: Verify complete file structure**

```bash
find . -type f -not -path './.git/*' -not -path './.claude/*' | sort
```

Expected:
```
./.claude-plugin/marketplace.json
./.claude-plugin/plugin.json
./agents/jira-agent.md
./docs/plans/2026-02-17-jira-plugin-design.md
./docs/plans/2026-02-17-jira-plugin-implementation.md
./docs/plans/2026-02-18-jira-workflow-skills-design.md
./docs/plans/2026-02-18-jira-workflow-skills-implementation.md
./skills/jira-context/SKILL.md
./skills/jira-decompose/SKILL.md
./skills/jira-progress/SKILL.md
./skills/jira-work/SKILL.md
./skills/jira/SKILL.md
```

No `jira-issue`, `jira-search`, `jira-transition`, `jira-sprint`, `jira-planning` directories.

**Step 2: Verify all YAML frontmatters**

```bash
for f in skills/*/SKILL.md agents/*.md; do echo "=== $f ==="; head -3 "$f"; echo; done
```

All files start with `---` on line 1 and have `name:` on line 2.

**Step 3: Verify no MCP dependency**

```bash
test ! -f .mcp.json && echo "PASS: No MCP config" || echo "FAIL"
```

**Step 4: Estimate token costs**

```bash
for f in skills/*/SKILL.md; do echo "=== $f ==="; sed -n '/^---$/,/^---$/p' "$f" | wc -w; done
```

All frontmatters should be under 60 words each (~80 tokens). Total idle cost should remain under 500 tokens.

**Dependencies:** Tasks 6-7 (all files in final state).

---

## Dependency Graph

```
Task 1 (delete atomics)
  ├── Task 2 (jira-context)
  ├── Task 3 (jira-progress)
  ├── Task 4 (jira-decompose)
  └── Task 5 (jira-work)
        ├── Task 6 (update entry router)
        └── Task 7 (update subagent)
              └── Task 8 (integration verification)
```

Tasks 2-5 can run in parallel after Task 1.
Tasks 6-7 can run in parallel after Tasks 2-5.
Task 8 runs last.
