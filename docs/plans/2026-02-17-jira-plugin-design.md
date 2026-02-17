# Jira CLI Plugin for Claude Code — Design Document

**Date:** 2026-02-17
**Status:** Approved
**Replaces:** Official Atlassian Rovo MCP plugin (~24,500 tokens idle)

---

## Problem

The official Atlassian Rovo MCP injects 37 tool schemas (~24,500 tokens) into every message, even for unrelated queries. Verbose JSON responses blow out context windows after 2-3 operations. Multi-step workflows (create issue = 4-5 sequential tool calls) compound the cost. This makes sustained Jira work in Claude Code impractical.

## Solution

A Claude Code plugin that uses the official Atlassian CLI (`acli`) via bash instead of MCP. Skills provide progressive disclosure of ACLI knowledge. Users choose between direct execution (main agent runs ACLI) or subagent isolation (separate context handles ACLI, returns compact summaries).

**Target metrics:**
- Idle cost: ~80 tokens (down from 24,500 — 99.7% reduction)
- Per-operation cost: ~400-600 tokens (direct) or ~1500 tokens (subagent, but main context only sees summary)
- Zero MCP tool schemas in any context

---

## Architecture

```
User says something Jira-related
         |
         v
+-------------------------+
|   jira (entry skill)    |  <-- ~80 tokens idle in main context
|                         |
|  Detects intent, asks:  |
|  "Direct or Subagent?"  |
+--------+-------+--------+
         |       |
    Direct|       |Subagent
         |       |
         v       v
+----------+  +------------------+
| Main     |  | jira-agent       |
| agent    |  | (separate ctx)   |
| loads    |  | loads same       |
| skills   |  | skills           |
+----+-----+  +------+-----------+
     |               |
     +-------+-------+
             v
  +----------------------+
  |  Progressive ACLI    |
  |  Skill Layer         |
  |                      |
  |  jira-issue          |
  |  jira-search         |
  |  jira-transition     |
  |  jira-sprint         |
  |  jira-planning       |
  +----------------------+
             |
             v
        +---------+
        |  bash   |
        |  acli   |
        +---------+
```

### Execution Modes

**Direct mode:** Main agent loads the relevant skill, runs `acli` bash commands, sees raw output (controlled by `--fields`/`--json` flags). Best for quick single operations.

**Subagent mode:** Main agent spawns `jira-agent` which loads skills, runs ACLI, and returns compact summaries. Best for bulk operations, complex multi-step workflows, or sessions with many Jira operations. Raw ACLI output never enters main context.

The entry skill presents this choice on first Jira invocation per session and remembers it. Users can switch modes mid-session.

---

## Backend: Atlassian CLI (acli)

**What:** Official Atlassian CLI, GA since May 2025, free with all Jira Cloud plans.

**Install:** `brew tap atlassian/homebrew-acli && brew install acli`

**Auth:** `acli jira auth login --web --site <site>.atlassian.net` (user responsibility, not automated by skills)

**Config storage:** `~/.acli/` — persists across terminal sessions, handles OAuth refresh silently.

**Key flags for agent use:**
- `--json` — structured output on all commands
- `--fields "key,summary,status,assignee"` — control verbosity at source
- `--csv` — compact tabular format
- `--count` — just counts, no data
- `--yes` — skip confirmation prompts (critical for non-interactive use)
- `--paginate` — auto-handle pagination
- `--jql` on edit/transition — bulk operations in single command

### Known Capability Gaps (Accepted)

| Missing from ACLI | Workaround |
|---|---|
| Worklogs | Not supported in v1. Add REST API fallback skill later if needed. |
| User lookup by name | Use email directly with `--assignee`. |
| Field metadata inspection | Not supported in v1. Users specify field names directly. |
| Remote issue links | Not supported in v1. |
| Custom field edits by ID | Use `--from-json` with JSON payload. |

These gaps are non-blocking for the priority use cases (Issue CRUD > Daily workflow > Reporting).

---

## Plugin File Structure

```
jira-plugin/
+-- .claude-plugin/
|   +-- plugin.json              # Plugin metadata (name, version, author)
|   +-- marketplace.json         # Distribution config
+-- agents/
|   +-- jira-agent.md            # Subagent: ACLI executor in isolated context
+-- skills/
|   +-- jira/
|   |   +-- SKILL.md             # Entry point: intent detection + mode routing
|   +-- jira-issue/
|   |   +-- SKILL.md             # Issue CRUD: view, create, edit, delete, assign, clone, comment
|   +-- jira-search/
|   |   +-- SKILL.md             # JQL reference + search/filter commands
|   +-- jira-transition/
|   |   +-- SKILL.md             # Workflow transitions, status changes
|   +-- jira-sprint/
|   |   +-- SKILL.md             # Sprint listing, board ops, sprint issues
|   +-- jira-planning/
|       +-- SKILL.md             # Compound workflows: standup prep, my tasks, workload
+-- docs/
    +-- plans/
        +-- 2026-02-17-jira-plugin-design.md  # This document
```

No `.mcp.json` — zero MCP overhead.

---

## Skill Specifications

### Entry Skill: `jira`

**Idle cost:** ~80 tokens (metadata only)
**Loaded cost:** ~300 tokens

**Responsibilities:**
1. Detect Jira-related intent from user message
2. On first invocation per session: present execution mode choice with cost/benefit explanation
3. Remember chosen mode for rest of session
4. Route to appropriate sub-skill based on operation type
5. In subagent mode: spawn `jira-agent` and delegate

**Trigger examples:**
- "Show me my Jira tickets"
- "Create a bug in PROJECT"
- "What's in the current sprint?"
- "Search for issues assigned to me"
- "Move PROJ-123 to Done"

**Prereq check (not auth automation):**
On first use, the skill instructs the agent to run `acli jira auth status`. If unauthenticated, inform the user with install/auth instructions. Do not attempt auth on the user's behalf.

### `jira-issue`

**Loaded cost:** ~500 tokens

**ACLI commands covered:**
- `acli jira workitem view KEY-123 --fields "summary,status,assignee,priority" --json`
- `acli jira workitem create --summary "..." --project "..." --type "Task" --yes`
- `acli jira workitem edit --key "KEY-123" --summary "New title" --yes`
- `acli jira workitem delete --key "KEY-123" --yes`
- `acli jira workitem assign --key "KEY-123" --assignee "user@email.com"`
- `acli jira workitem clone --key "KEY-123"`
- `acli jira workitem comment-create --key "KEY-123" --body "..."`
- `acli jira workitem comment-list --key "KEY-123"`

**Field selection guidance:** Default to `--fields "key,summary,status,assignee,priority,issuetype"` to control output size. Include `description` only when user explicitly asks for details.

### `jira-search`

**Loaded cost:** ~600 tokens

**ACLI commands covered:**
- `acli jira workitem search --jql "..." --fields "key,summary,status,assignee" --json`
- `acli jira workitem search --jql "..." --csv` (compact tabular)
- `acli jira workitem search --jql "..." --count` (just count)
- `acli jira workitem search --jql "..." --paginate` (auto-pagination)

**Embedded JQL reference (domain-specific subset):**

```
# Assignment
assignee = currentUser()
assignee = "user@email.com"

# Status
status = "In Progress"
status in ("To Do", "In Progress")
statusCategory = "Done"

# Type and project
issuetype in (Bug, Story, Task)
project = "PROJ"

# Sprint
sprint in openSprints()
sprint in closedSprints()

# Dates
created >= -7d
updated >= -24h
due < now()                    # overdue
due <= endOfWeek()

# Text search
text ~ "search term"
summary ~ "keyword"

# Labels
labels in ("backend", "urgent")

# Ordering
ORDER BY priority DESC, updated DESC

# Combining
project = PROJ AND status != Done AND assignee = currentUser()
```

Date functions: `now()`, `startOfDay()`, `endOfDay()`, `startOfWeek()`, `endOfWeek()`, `startOfMonth()`, `endOfMonth()`. Relative: `-1d`, `-7d`, `-1w`, `-1m`.

### `jira-transition`

**Loaded cost:** ~300 tokens

**ACLI commands covered:**
- `acli jira workitem transition --key "KEY-123" --status "In Progress" --yes`
- `acli jira workitem transition --jql "project = PROJ AND status = 'To Do'" --status "In Progress" --yes` (bulk)

**Common workflow patterns:**
- To Do -> In Progress -> In Review -> Done
- Reopen: Done -> To Do

**Note:** Unlike the MCP which requires fetching transition IDs first, ACLI accepts status names directly. This eliminates the two-step lookup pattern entirely.

### `jira-sprint`

**Loaded cost:** ~300 tokens

**ACLI commands covered:**
- `acli jira board list` (find board ID)
- `acli jira board list-sprints --board BOARD-ID` (list sprints for a board)
- `acli jira sprint list-workitems SPRINT-ID --fields "key,summary,status,assignee" --json`

**Common patterns:**
- Current sprint issues: find board → list sprints → filter active → list work items
- Sprint velocity: compare closed sprint work item counts

### `jira-planning`

**Loaded cost:** ~400 tokens

**Compound workflows built from other skills:**

**Standup prep:**
```
1. Search: assignee = currentUser() AND sprint in openSprints() AND status changed AFTER startOfDay(-1)
2. Search: assignee = currentUser() AND sprint in openSprints() AND status = "In Progress"
3. Format as: Done yesterday / Working on today / Blocked
```

**My tasks:**
```
1. Search: assignee = currentUser() AND status != Done ORDER BY priority DESC, updated DESC
2. Group by status, show priority
```

**Workload review:**
```
1. Search: sprint in openSprints() AND project = "PROJ"
2. Group by assignee, count by status
```

---

## Subagent: `jira-agent`

**Purpose:** Execute ACLI commands in an isolated context window. Load the same progressive skills. Return compact summaries to main agent.

**Model:** Inherit from main conversation

**Output formatting rules:**
- Issue view: `KEY-123: "Title" [Status] assigned to User (Priority)`
- Search results: Compact table — key | summary | status | assignee
- Create/edit: `Created KEY-124: "Title" in Project` or `Updated KEY-123: summary changed`
- Transitions: `KEY-123: To Do -> In Progress`
- Errors: Clear message + suggested fix

**Multi-step handling:** The subagent executes complete workflows internally (e.g., find board -> list sprints -> get issues) and returns only the final result. Intermediate steps never surface to main context.

**Error handling (same as direct mode):**
- Auth failure: `"Not authenticated. Run: acli jira auth login --web --site <your-site>.atlassian.net"`
- ACLI not found: `"ACLI not installed. Run: brew tap atlassian/homebrew-acli && brew install acli"`
- JQL syntax error: Show the error message, suggest corrected JQL
- Permission denied: Report clearly, suggest checking Jira permissions

---

## Error Handling Pattern (Shared Across All Skills)

Every skill includes this error interpretation block:

```
If ACLI returns exit code != 0:
  - "authentication failed" -> Tell user to run: acli jira auth login --web
  - "command not found: acli" -> Tell user to run: brew tap atlassian/homebrew-acli && brew install acli
  - "trace id:" prefix -> Unexpected server error, report trace ID
  - JQL error message -> Show error, suggest fix based on JQL reference
  - Other -> Report raw error message
```

Auth is never automated. The skill informs; the user acts.

---

## Token Cost Analysis

| Scenario | This Plugin | Rovo MCP (current) |
|---|---|---|
| Idle (no Jira work) | ~80 tokens | ~24,500 tokens |
| Single issue view (direct) | ~580 tokens | ~25,000+ tokens |
| Single issue view (subagent) | ~80 + ~50 summary | ~25,000+ tokens |
| JQL search 20 results (direct) | ~600 + ~3000 output | ~28,000+ tokens |
| JQL search 20 results (subagent) | ~80 + ~500 summary | ~28,000+ tokens |
| 10 operations in session (direct) | ~15,000 accumulated | ~50,000+ tokens |
| 10 operations in session (subagent) | ~5,000 accumulated | ~50,000+ tokens |

---

## Scope & Known Limitations

**In scope (v1):**
- Issue CRUD (view, create, edit, delete, assign, clone)
- Comments (add, list)
- JQL search with field filtering
- Workflow transitions (by status name)
- Sprint and board operations
- Compound planning workflows (standup, my tasks, workload)

**Out of scope (v1):**
- Confluence (no CLI support, add later)
- Worklogs (ACLI gap)
- Remote issue links (ACLI gap)
- Field metadata discovery (ACLI gap)
- Custom field edits by field ID (use `--from-json` workaround)
- User lookup by name (use email directly)

**Prerequisites (user responsibility):**
- ACLI installed: `brew tap atlassian/homebrew-acli && brew install acli`
- Authenticated: `acli jira auth login --web --site <site>.atlassian.net`
