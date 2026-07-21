# Jira Workflow Skills — Design Document

**Date:** 2026-02-18
**Status:** Approved
**Builds on:** 2026-02-17-jira-plugin-design.md (v1 atomic skills)

---

## Problem

The v1 plugin shipped 5 atomic skills organized by ACLI command category (issue, search, transition, sprint, planning). This is an API surface, not a user surface. Real Jira work chains multiple operations — "pull a ticket and understand it", "update status with context", "break a spec into tickets." Users shouldn't have to orchestrate the composition manually.

## Solution

Replace the 5 atomic skills with 4 workflow skills that map to what users actually sit down to accomplish. ACLI commands are inlined into each workflow — no separate reference skill. The entry router and subagent are updated to route to workflows.

---

## Plugin Structure (After)

```
jira-plugin/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── agents/
│   └── jira-agent.md              # Updated for workflow routing
├── skills/
│   ├── jira/
│   │   └── SKILL.md               # Entry router (updated routing table)
│   ├── jira-context/
│   │   └── SKILL.md               # Pull ticket for agent context
│   ├── jira-progress/
│   │   └── SKILL.md               # Update ticket by workflow stage
│   ├── jira-decompose/
│   │   └── SKILL.md               # Spec to tickets
│   └── jira-work/
│       └── SKILL.md               # Agent picks up and works a ticket
└── docs/
    └── plans/
```

**Deleted:** `skills/jira-issue/`, `skills/jira-search/`, `skills/jira-transition/`, `skills/jira-sprint/`, `skills/jira-planning/`

---

## Workflow Skills

### 1. `jira-context` — Pull Ticket for Agent Context

**Trigger:** User or agent needs to understand a ticket before acting on it — pulling context for an agent, reviewing a ticket's full picture, or loading ticket details for decision-making.

**Procedure:**

1. Fetch the target ticket with full fields (including description)
2. Fetch subtasks via JQL: `parent = KEY-123`
3. Fetch comments
4. Package as a structured context block:

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

The skill controls the output format. Downstream skills (like jira-work) get a predictable structure to reason against.

**ACLI commands:**
- `acli jira workitem view KEY-123 --fields "key,summary,status,assignee,priority,issuetype,description" --json`
- `acli jira workitem search --jql "parent = KEY-123" --fields "key,summary,status" --csv`
- `acli jira workitem comment-list --key "KEY-123"`

---

### 2. `jira-progress` — Update Ticket by Workflow Stage

**Trigger:** Work on a ticket has reached a stage boundary — started working, sent for review, completed, blocked, or reopened.

**Stage definitions:**

| Stage | Status Transition | Auto-comment | Optional Fields |
|-------|------------------|--------------|-----------------|
| `start` | → In Progress | "Started work" | assignee (claim it) |
| `review` | → In Review | "Submitted for review" | — |
| `done` | → Done | "Completed: {summary}" | resolution |
| `block` | → Blocked | "Blocked: {reason}" | — |
| `reopen` | → To Do | "Reopened: {reason}" | — |

**Procedure:**

1. Determine the stage from user intent (natural language → stage mapping)
2. Transition the ticket status
3. Add a comment describing what happened — agent composes this from context, not a canned string
4. Update any additional fields if specified
5. Confirm: `KEY-123: To Do → In Progress | Comment added`

The comment is the valuable part. A bare status transition is cheap — what matters is the *why*. The skill prompts the agent to compose a meaningful comment.

**ACLI commands:**
- `acli jira workitem transition --key "KEY-123" --status "In Progress" --yes`
- `acli jira workitem comment-create --key "KEY-123" --body "Started work on API refactor"`
- `acli jira workitem edit --key "KEY-123" --assignee "user@email.com" --yes`

---

### 3. `jira-decompose` — Spec to Tickets

**Trigger:** User has a spec, architecture doc, implementation plan, or feature description and wants to break it into Jira tickets for distribution to people or agents.

**Procedure:**

1. Read the source document (file path, Confluence page, or inline text)
2. Analyze and propose a ticket hierarchy:
   - One epic for the overall effort
   - Stories/tasks as children, scoped to independently deliverable chunks
   - Each ticket gets: summary, description with acceptance criteria, suggested assignee if mentioned
3. Present the proposed breakdown for user approval before creating anything:

```
Proposed breakdown for "Auth System Redesign":

Epic: AUTH-??? "Auth System Redesign"
├── Task: "Migrate session store to Redis" — assignee: alice@...
├── Task: "Implement JWT refresh flow" — assignee: bob@...
├── Task: "Add rate limiting to auth endpoints" — unassigned
└── Task: "Update auth integration tests" — unassigned

Create these 5 tickets? (You can adjust before I create them)
```

4. On approval, create all tickets: epic first, then children with parent linkage
5. Return a summary table of everything created

Always proposes before creating. Bulk ticket creation is hard to undo.

**ACLI commands:**
- `acli jira workitem create --summary "Epic title" --project "PROJ" --type "Epic" --description "..." --yes`
- `acli jira workitem create --summary "Task title" --project "PROJ" --type "Task" --parent "EPIC-KEY" --description "..." --assignee "user@email.com" --yes`

---

### 4. `jira-work` — Agent Picks Up and Works a Ticket

**Trigger:** User assigns a ticket to the agent, says "work on this," or wants the agent to pick up a ticket and execute against it.

**Procedure:**

```
1. CLAIM
   - Assign ticket to current user (or note it's already assigned)
   - Transition → In Progress
   - Comment: "Picked up by agent — starting work"

2. CONTEXT
   - Load full ticket context (same pattern as jira-context)
   - Parse acceptance criteria / requirements from description
   - Identify subtasks if any

3. EXECUTE
   - Do the work described in the ticket
   - This is intentionally open — the work could be:
     - Writing code
     - Research and reporting back
     - Creating a document
     - Running a workflow from another skill
   - The skill defines WHEN to update Jira, not WHAT the work is

4. CHECKPOINT (during execution)
   - If blocked: transition → Blocked, comment with blocker, stop and report to user
   - If scope question arises: comment the question on the ticket, ask user

5. COMPLETE
   - Transition → In Review (or Done, based on user preference)
   - Comment: summary of what was done, what changed, any follow-ups
   - If code was written: reference the branch/PR in the comment
```

This skill is a harness, not a task executor. It wraps whatever work the agent does with Jira discipline — claim at start, update when blocked, report at end. The value is that the agent never forgets to update the ticket.

**ACLI commands:**
- `acli jira workitem assign --key "KEY-123" --assignee "user@email.com"`
- `acli jira workitem transition --key "KEY-123" --status "In Progress" --yes`
- `acli jira workitem comment-create --key "KEY-123" --body "..."`
- `acli jira workitem view KEY-123 --fields "key,summary,status,assignee,priority,issuetype,description" --json`
- `acli jira workitem transition --key "KEY-123" --status "Done" --yes`

---

## Entry Router Updates

**Updated routing table:**

| User intent | Skill |
|---|---|
| "Show me ticket X", "pull context for X", "what's in X" | `jira-context` |
| "Start working on X", "mark X as done", "X is blocked" | `jira-progress` |
| "Break this spec into tickets", "create tickets from this plan" | `jira-decompose` |
| "Work on X", "pick up X", "agent handle X" | `jira-work` |

For intents that don't match a workflow (e.g., "just create a blank ticket", "search for bugs in PROJ", "delete PROJ-99") — the entry skill has the agent handle it directly using ACLI. No dedicated skill needed.

**Unchanged:** Mode selection (direct vs subagent), prereq check (`acli jira auth status`), error handling pattern.

---

## Subagent Updates

The `jira-agent` description and examples are updated to reference workflows instead of atomic operations. Output formatting rules stay the same.

---

## Error Handling (Shared)

Every workflow includes this error interpretation:

```
If ACLI returns exit code != 0:
  - "authentication failed" → Tell user: acli jira auth login --web --site <site>.atlassian.net
  - "command not found: acli" → Tell user: brew tap atlassian/homebrew-acli && brew install acli
  - "trace id:" prefix → Unexpected server error, report trace ID
  - JQL error → Show error, suggest corrected syntax
  - Other → Report raw error message
```

Auth is never automated. The skill informs; the user acts.

---

## Migration

1. Delete: `skills/jira-issue/`, `skills/jira-search/`, `skills/jira-transition/`, `skills/jira-sprint/`, `skills/jira-planning/`
2. Create: `skills/jira-context/`, `skills/jira-progress/`, `skills/jira-decompose/`, `skills/jira-work/`
3. Update: `skills/jira/SKILL.md` (routing table), `agents/jira-agent.md` (examples + description)
