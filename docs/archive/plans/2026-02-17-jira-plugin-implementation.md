# Jira CLI Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Claude Code plugin that replaces the 24.5k-token Rovo MCP with ACLI-backed skills using progressive disclosure and optional subagent isolation.

**Architecture:** Entry skill routes to domain-specific ACLI skills. Users choose direct mode (main agent runs ACLI) or subagent mode (jira-agent runs ACLI in isolated context). Same progressive skill layer consumed by both paths.

**Tech Stack:** Atlassian CLI (acli), Claude Code plugin system (skills + agents), bash

**Design doc:** `docs/plans/2026-02-17-jira-plugin-design.md`

**Reference implementation:** Todoist plugin at `~/.claude/plugins/cache/todoist-marketplace/todoist/1.0.0/`

---

### Task 1: Plugin Scaffolding

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`

**Step 1: Create plugin.json**

```json
{
  "name": "jira",
  "description": "Token-efficient Jira integration via Atlassian CLI with progressive skill disclosure",
  "version": "1.0.0",
  "author": {
    "name": "Jack Hutson"
  },
  "license": "MIT",
  "keywords": ["jira", "atlassian", "acli", "project-management"]
}
```

**Step 2: Create marketplace.json**

```json
{
  "name": "jira-marketplace",
  "owner": {
    "name": "Jack Hutson"
  },
  "plugins": [
    {
      "name": "jira",
      "source": "./",
      "description": "Token-efficient Jira integration via Atlassian CLI with progressive skill disclosure"
    }
  ]
}
```

**Step 3: Verify structure**

Run: `find .claude-plugin -type f | sort`
Expected:
```
.claude-plugin/marketplace.json
.claude-plugin/plugin.json
```

**Step 4: Commit**

```bash
git add .claude-plugin/
git commit -m "feat: add plugin scaffolding (plugin.json, marketplace.json)"
```

---

### Task 2: jira-issue Skill (Issue CRUD)

**Files:**
- Create: `skills/jira-issue/SKILL.md`

**Step 1: Write the skill file**

The YAML frontmatter (metadata) should be ~60 tokens. Trigger on issue CRUD keywords.

The body should cover:
- `acli jira workitem view` with `--fields` and `--json` flags
- `acli jira workitem create` with `--summary`, `--project`, `--type`, `--yes`
- `acli jira workitem edit` with `--key`, field flags, `--yes`
- `acli jira workitem delete` with `--key`, `--yes`
- `acli jira workitem assign` with `--key`, `--assignee`
- `acli jira workitem clone` with `--key`
- `acli jira workitem comment-create` and `comment-list`
- Default field selection: `--fields "key,summary,status,assignee,priority,issuetype"`
- Include `description` only when user asks for details
- Shared error handling block (auth, not-found, acli-missing)
- Cross-references to jira-search and jira-transition for adjacent operations

**Step 2: Verify YAML frontmatter parses correctly**

Run: `head -20 skills/jira-issue/SKILL.md`
Verify: YAML block starts with `---` and ends with `---`, contains `name:` and `description:`.

**Step 3: Commit**

```bash
git add skills/jira-issue/
git commit -m "feat: add jira-issue skill (issue CRUD via ACLI)"
```

---

### Task 3: jira-search Skill (JQL + Search)

**Files:**
- Create: `skills/jira-search/SKILL.md`

**Step 1: Write the skill file**

Metadata triggers on: "search jira", "find issues", "jql", "query issues", "list issues matching".

Body should cover:
- `acli jira workitem search --jql "..." --fields "..." --json`
- `acli jira workitem search --jql "..." --csv` for compact output
- `acli jira workitem search --jql "..." --count` for counts only
- `--paginate` flag for large result sets
- Complete JQL reference (from design doc section): assignment, status, type, project, sprint, dates, text search, labels, ordering, combining
- Date functions list
- Common JQL patterns with examples
- Guidance: always include `--fields` to control output size
- Shared error handling block
- Special: JQL syntax error recovery — show the error, suggest corrected syntax

**Step 2: Verify YAML frontmatter**

Run: `head -20 skills/jira-search/SKILL.md`

**Step 3: Commit**

```bash
git add skills/jira-search/
git commit -m "feat: add jira-search skill (JQL reference + search commands)"
```

---

### Task 4: jira-transition Skill (Workflow Transitions)

**Files:**
- Create: `skills/jira-transition/SKILL.md`

**Step 1: Write the skill file**

Metadata triggers on: "move issue", "transition", "change status", "mark as done", "start working on".

Body should cover:
- `acli jira workitem transition --key "..." --status "..." --yes`
- `acli jira workitem transition --jql "..." --status "..." --yes` for bulk transitions
- Note: ACLI accepts status names directly (no transition ID lookup needed — key advantage over MCP)
- Common workflow patterns: To Do -> In Progress -> In Review -> Done, Reopen
- Shared error handling block
- Cross-reference to jira-issue for other edits, jira-search for finding issues to transition

**Step 2: Verify YAML frontmatter**

Run: `head -20 skills/jira-transition/SKILL.md`

**Step 3: Commit**

```bash
git add skills/jira-transition/
git commit -m "feat: add jira-transition skill (workflow status changes)"
```

---

### Task 5: jira-sprint Skill (Sprint & Board Operations)

**Files:**
- Create: `skills/jira-sprint/SKILL.md`

**Step 1: Write the skill file**

Metadata triggers on: "current sprint", "sprint issues", "board", "sprint status", "what's in the sprint".

Body should cover:
- `acli jira board list` to find board IDs
- `acli jira board list-sprints --board BOARD-ID` to list sprints
- `acli jira sprint list-workitems SPRINT-ID --fields "..." --json`
- Multi-step pattern: find board -> list sprints -> filter active -> list work items
- Note: board/sprint discovery is a multi-step chain — ideal use case for subagent mode
- Shared error handling block
- Cross-reference to jira-search for JQL-based sprint queries (`sprint in openSprints()`)

**Step 2: Verify YAML frontmatter**

Run: `head -20 skills/jira-sprint/SKILL.md`

**Step 3: Commit**

```bash
git add skills/jira-sprint/
git commit -m "feat: add jira-sprint skill (sprint and board operations)"
```

---

### Task 6: jira-planning Skill (Compound Workflows)

**Files:**
- Create: `skills/jira-planning/SKILL.md`

**Step 1: Write the skill file**

Metadata triggers on: "standup", "my tasks", "workload", "what am I working on", "daily planning", "team status".

Body should cover three compound workflows:

**Standup prep:**
1. Search: `assignee = currentUser() AND sprint in openSprints() AND status changed AFTER startOfDay(-1)` (done yesterday)
2. Search: `assignee = currentUser() AND sprint in openSprints() AND status = "In Progress"` (working on)
3. Format as: Done yesterday / Working on today / Blocked

**My tasks:**
1. Search: `assignee = currentUser() AND status != Done ORDER BY priority DESC, updated DESC`
2. Group by status, show priority

**Workload review:**
1. Search: `sprint in openSprints() AND project = "PROJ"` (user provides project)
2. Group by assignee, count by status

Each workflow is a sequence of ACLI search commands with specific JQL and formatting instructions.

- Shared error handling block
- Note: compound workflows are the strongest case for subagent mode (multiple searches, only final formatted result matters)

**Step 2: Verify YAML frontmatter**

Run: `head -20 skills/jira-planning/SKILL.md`

**Step 3: Commit**

```bash
git add skills/jira-planning/
git commit -m "feat: add jira-planning skill (standup, my tasks, workload)"
```

---

### Task 7: jira-agent Subagent

**Files:**
- Create: `agents/jira-agent.md`

**Step 1: Write the agent file**

Follow Todoist agent format exactly. YAML frontmatter with:
- `name: jira-agent`
- `description:` with 3-4 `<example>` blocks showing when to delegate
- `model: inherit`
- `color: green` (distinguish from Todoist's cyan)

Body should cover:
- Role: ACLI operations specialist, executes Jira CLI commands, returns concise results
- Core responsibilities: execute ACLI commands, use progressive skills, return compact summaries
- Instruct the agent to use the Skill tool to load `jira-issue`, `jira-search`, `jira-transition`, `jira-sprint`, `jira-planning` skills as needed for the requested operation
- Output formatting rules (from design doc):
  - Issue view: `KEY-123: "Title" [Status] assigned to User (Priority)`
  - Search: compact table
  - Create/edit: one-line confirmation
  - Transitions: `KEY-123: Status A -> Status B`
  - Errors: clear message + fix suggestion
- Multi-step handling: execute entire chains internally, return only final result
- Error handling: auth failures, acli not found, JQL errors, permission denied
- Always use `--yes` flag to skip interactive confirmations
- Always use `--fields` to control output verbosity

**Step 2: Verify YAML frontmatter**

Run: `head -45 agents/jira-agent.md`
Verify: YAML block with name, description (with examples), model, color.

**Step 3: Commit**

```bash
git add agents/
git commit -m "feat: add jira-agent subagent for isolated ACLI execution"
```

---

### Task 8: jira Entry Skill (Router)

**Files:**
- Create: `skills/jira/SKILL.md`

**Step 1: Write the entry skill**

This is the most important file — it's the only skill whose metadata is always loaded (~80 tokens idle).

Metadata triggers should be broad: any mention of Jira, issues, tickets, sprints, JQL, standup prep, project management tasks.

Body should cover:

**Prereq check:**
- On first use in session, run `acli jira auth status` via bash
- If auth fails: inform user to run `acli jira auth login --web --site <site>.atlassian.net`
- If acli not found: inform user to run `brew tap atlassian/homebrew-acli && brew install acli`
- Do NOT automate auth — just check and inform

**Mode selection (first invocation per session):**
- Present two options to user:
  - **Direct mode:** "I'll run ACLI commands directly. Faster per-operation but output accumulates in our conversation. Best for a few quick operations."
  - **Subagent mode:** "I'll delegate to a Jira specialist agent in a separate context. Slightly slower per-operation but keeps our conversation clean. Best for bulk work or many operations."
- Remember choice for rest of session
- User can say "switch to direct/subagent" to change mid-session

**Skill routing table:**
| User intent | Skill to invoke |
|---|---|
| View, create, edit, delete, assign, clone issue | `jira-issue` |
| Search, find, list, query, JQL | `jira-search` |
| Move, transition, change status | `jira-transition` |
| Sprint, board, current sprint | `jira-sprint` |
| Standup, my tasks, workload, planning | `jira-planning` |

**Direct mode:** Invoke the relevant skill, then run ACLI commands directly via bash.

**Subagent mode:** Spawn `jira-agent` (via Task tool) with the user's request. The agent loads the relevant skills itself.

**Step 2: Verify YAML frontmatter**

Run: `head -20 skills/jira/SKILL.md`

**Step 3: Commit**

```bash
git add skills/jira/
git commit -m "feat: add jira entry skill (mode selection + routing)"
```

---

### Task 9: Integration Verification

**Files:**
- No new files. Verify existing files work together.

**Step 1: Verify complete file structure**

Run: `find . -type f -not -path './.git/*' | sort`

Expected:
```
./.claude-plugin/marketplace.json
./.claude-plugin/plugin.json
./agents/jira-agent.md
./docs/plans/2026-02-17-jira-plugin-design.md
./docs/plans/2026-02-17-jira-plugin-implementation.md
./jira-mcp-research.md
./skills/jira-issue/SKILL.md
./skills/jira-planning/SKILL.md
./skills/jira-search/SKILL.md
./skills/jira-sprint/SKILL.md
./skills/jira-transition/SKILL.md
./skills/jira/SKILL.md
```

**Step 2: Verify all YAML frontmatters parse**

Run: `for f in skills/*/SKILL.md agents/*.md; do echo "=== $f ==="; head -3 "$f"; echo; done`

Verify: Every file starts with `---` on line 1 and has `name:` on line 2.

**Step 3: Estimate token costs**

Count approximate tokens for each skill metadata (YAML `description:` field only):
- Target: each skill description < 80 tokens
- Total idle cost (all 6 skill descriptions): < 500 tokens

Run: `for f in skills/*/SKILL.md; do echo "=== $f ==="; sed -n '/^---$/,/^---$/p' "$f" | wc -w; done`

Word count of frontmatter * ~1.3 ≈ token count. Each should be under 60 words.

**Step 4: Verify no MCP dependency**

Run: `test ! -f .mcp.json && echo "PASS: No MCP config" || echo "FAIL: MCP config found"`

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete jira CLI plugin v1.0.0

Six skills (jira, jira-issue, jira-search, jira-transition, jira-sprint,
jira-planning) with progressive ACLI disclosure and optional subagent
isolation. Replaces 24.5k-token Rovo MCP with ~80 token idle cost."
```

---

## Task Dependency Graph

```
Task 1 (scaffolding)
  |
  v
Tasks 2-6 (domain skills — independent, can be parallelized)
  |
  v
Task 7 (subagent — references all domain skills)
  |
  v
Task 8 (entry skill — references all domain skills + subagent)
  |
  v
Task 9 (integration verification)
```

Tasks 2-6 have no dependencies on each other and can be built in any order or in parallel.
