# Atlassian Rovo MCP — Context Cost Optimization Plugin

## Your Mission

Build a Claude Code plugin that wraps the official Atlassian Rovo MCP server in a subagent architecture to drastically reduce context window burn. The target products are **Jira + Confluence**. The plugin should support issue CRUD, sprint/planning workflows, JQL search/reporting, and Confluence page operations.

## Reference Architecture

Study this repo for the pattern of composing a subagent with skills to reduce context burn:
**https://github.com/jackhutson/todoist-mcp-plugin**

Key architectural ideas from that project:

- Skills expose only short metadata (name + description) to the main context (~40-80 tokens each)
- Full skill instructions load on demand only when triggered
- A subagent holds the actual MCP connection in a **separate context window** so tool schemas never touch the main conversation
- The subagent is instructed to return compact, summarized responses instead of raw API output
- Session-level caching (e.g., project structure synced once, reused across operations)

You are NOT required to copy this architecture exactly. Use it as inspiration. The core goal is: **minimize idle token cost and per-operation token cost when using the Atlassian Rovo MCP from Claude Code.**

---

## Critical Architecture Decision: MCP vs CLI vs Direct API

Before you start building, you need to evaluate and decide which backend approach to use. There are three realistic options, each with different tradeoffs. **Investigate all three, then pick the best one (or a hybrid).**

### Option A: Official Atlassian Rovo MCP (via subagent)

**What it is**: Wrap `mcp.atlassian.com/v1/mcp` in a subagent so tool schemas live in an isolated context window.

| Pros                                                   | Cons                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| Official, supported by Atlassian                       | 37 tool schemas still loaded in subagent (~24.5k tokens there)  |
| OAuth 2.1 — no API keys to manage                      | Auth timeout issues (30-60 min, being fixed)                    |
| Full Jira + Confluence + Compass coverage              | Verbose JSON responses from tools (the Issue #17 problem)       |
| Permissions match user's Atlassian roles               | Requires `mcp-remote` proxy (npx dependency)                    |
| Subagent isolation eliminates idle cost in main window | Per-operation cost includes subagent spin-up + full schema load |

### Option B: CLI Tools (zero MCP overhead)

**What it is**: Use command-line tools invoked via bash. The agent calls `bash` to run CLI commands. **Zero tool schemas injected.** The skill teaches the agent the CLI syntax; the agent shells out.

There are two CLI options:

**B1: Atlassian ACLI (Official)**

- Atlassian's own CLI, GA since May 2025, included in all Jira plans
- Install: download binary for macOS/Windows/Linux from Atlassian
- Auth: `acli jira auth login --web` (OAuth browser flow)
- Jira coverage: Excellent — workitem CRUD, search (JQL), transitions, comments, sprints, boards, projects, fields, filters, dashboards, bulk operations
- **Confluence coverage: NONE as of Feb 2026** — explicitly requested by users, no timeline from Atlassian
- Commands are clean and scriptable: `acli jira workitem search --jql "..." --fields "key,summary,status" --json`
- Supports `--json` output on everything (easy to parse)
- Supports `--fields` flag to control which fields are returned (solves the verbose response problem at the source)
- Supports `--csv` output for compact tabular data

**B2: jira-cli by ankitpokhrel (Community, open source, Go)**

- URL: https://github.com/ankitpokhrel/jira-cli
- Very popular (~3.5k+ stars), actively maintained
- Auth: API token or PAT via environment variables
- Jira coverage: Full — issue CRUD, transitions, sprints, epics, boards, search, comments, links, cloning
- **Confluence coverage: NONE** — Jira only
- Clean CLI interface: `jira issue list --jql "..." --plain --columns key,summary,status`
- Supports `--plain` flag for minimal output (great for agent consumption)
- Interactive TUI mode (not useful for agents, but CLI mode is)
- Converts Atlassian Document Format to markdown automatically
- No `--json` but has `--plain` and `--no-headers` for machine-friendly output

| Pros (both CLIs)                                              | Cons (both CLIs)                                     |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| **Zero idle token cost** — no tool schemas at all             | No Confluence support in either                      |
| **Zero subagent overhead** — direct bash calls                | ACLI requires binary install (not just npm)          |
| `--fields`/`--json`/`--plain` flags solve verbosity at source | jira-cli needs API token (not OAuth)                 |
| No auth timeout issues (token-based)                          | Agent must learn CLI syntax (but skill teaches this) |
| Deterministic output format                                   | Updates/new features lag behind API                  |
| Works in any agent platform that has bash                     |                                                      |

### Option C: Direct REST API (via curl/scripts)

**What it is**: Use Python scripts or curl to call the Atlassian REST API directly. Similar to what netresearch/jira-skill does (https://github.com/netresearch/jira-skill — worth studying).

| Pros                                            | Cons                                           |
| ----------------------------------------------- | ---------------------------------------------- |
| Maximum control over request/response           | Must build and maintain scripts                |
| Full Jira + Confluence coverage via REST API    | API auth complexity (tokens, headers, cloudId) |
| Can precisely control which fields are returned | More work for the Claude Code agent to build   |
| Zero idle cost, zero MCP schema overhead        | Error handling burden on the scripts           |
| Can format responses exactly as needed          |                                                |

### Recommended Approach: Hybrid

The research strongly suggests a **hybrid approach**:

1. **For Jira**: Use **ACLI** (Option B1) as the primary backend. It's official, has excellent coverage, `--json` and `--fields` flags solve the verbosity problem, and it has **zero context cost** since it's just bash commands. Skills teach the agent ACLI syntax. No subagent needed.

2. **For Confluence**: Since no CLI exists, use either:
   - The **Rovo MCP via subagent** (Option A) but ONLY for Confluence tools (11 tools instead of 37 — much lighter)
   - **Direct REST API scripts** (Option C) using Python/curl to call the Confluence v2 API

3. **Decompose aggressively**: Each operation domain (issue CRUD, sprint planning, JQL search, Confluence read, Confluence write) should be its own skill. The agent only loads what it needs.

**You should investigate this tradeoff yourself.** Check if ACLI is practical to install in the Claude Code environment, test if the Rovo MCP can be configured to load only Confluence tools, and evaluate whether direct API scripts are worth the maintenance cost. Then make your decision and document it.

---

## Research: The Problem

### Token Cost of the Raw Rovo MCP

The official Atlassian Rovo MCP server (`mcp.atlassian.com/v1/mcp`) is one of the most expensive MCPs in terms of context cost:

- **37 tool schemas** injected into every message (Jira 13, Confluence 11, Compass 6, Rovo/shared 4)
- **~24,488 tokens per message** just for tool definitions — even for completely unrelated queries like "1+1?"
- Source: Atlassian Community thread by Luis Rudge, January 5, 2026: "For reference, asking '1+1?' with Jira MCP enabled costs 24,488 tokens. The same query without it costs a few hundred."

For comparison, the Todoist MCP costs ~2,500 tokens idle. The Atlassian MCP is roughly **10x worse**.

### Community-Reported Pain Points

**1. Verbose responses blow out context windows (GitHub Issue #17)**

- URL: https://github.com/atlassian/atlassian-mcp-server/issues/17
- Users with 20-50+ work items hit context limits after 2-3 queries
- Tool responses return excessive metadata (self URLs, avatar URLs, expand metadata, nested schema objects) per issue
- Daily planning workflows become impossible — context resets lose accumulated understanding
- The reporter requested: return only essential fields by default (key, summary, status, assignee), add optional `fields` parameter for additional data, compress repeated metadata
- 8+ upvotes from enterprise users

**2. Authentication timeouts on long sessions**

- URL: https://community.atlassian.com/forums/Atlassian-Rovo-MCP-Server/constant-authorization-timeouts/td-p/3177132
- Sessions frequently 401 after 30-60 minutes
- Atlassian team acknowledged and said they are "prioritising reducing the token consumption on multiple releases"
- The plugin should handle auth failures gracefully (inform user to re-auth)

**3. cloudId boilerplate**

- Every single tool call requires a `cloudId` parameter (a UUID identifying the Atlassian Cloud instance)
- Users must first call `getAccessibleAtlassianResources` to obtain this, then thread it through every subsequent call
- This wastes tokens on repeated identical boilerplate in every request

**4. Multi-step workflow chains**

- Creating an issue often requires 3-4 sequential tool calls:
  1. `getVisibleJiraProjects` (to get valid project key)
  2. `getJiraProjectIssueTypesMetadata` (to get valid issue type)
  3. Optionally `getJiraIssueTypeMetaWithFields` (to discover required custom fields)
  4. `lookupJiraAccountId` (to resolve assignee name → account ID)
  5. Finally `createJiraIssue`
- Transitioning issues requires:
  1. `getTransitionsForJiraIssue` (to get available transition IDs)
  2. `transitionJiraIssue` (with the correct transition ID)
- Each intermediate call adds tokens to context

**5. JQL/CQL syntax errors**

- LLMs frequently fumble JQL syntax, leading to failed queries and token-wasting retries
- The plugin should embed JQL/CQL reference material so the agent gets queries right on the first attempt

**6. Confluence + Compass bundled unnecessarily**

- Many users only need Jira, but pay context cost for all 37 tools including Confluence and Compass
- The plugin should be modular — only load what's needed

---

## Research: Complete Tool Inventory

### Official Rovo MCP Tools (as of Feb 2026)

These are the 37 tools whose schemas get injected. The plugin needs to cover the Jira and Confluence ones. Compass tools can be excluded.

#### Jira Tools (13)

| Tool                               | Description                           | Schema Complexity                                                                                                                                |
| ---------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getJiraIssue`                     | Get issue by ID or key                | Medium — has `fields`, `expand`, `properties` arrays                                                                                             |
| `createJiraIssue`                  | Create new issue                      | High — requires `cloudId`, `projectKey`, `issueTypeName`, `summary`; optional `description`, `assignee_account_id`, `additional_fields`          |
| `editJiraIssue`                    | Update issue fields                   | Medium — open `fields` object                                                                                                                    |
| `searchJiraIssuesUsingJql`         | JQL search                            | Medium — has `jql`, `maxResults` (max 100), `fields` array, `nextPageToken` pagination                                                           |
| `getTransitionsForJiraIssue`       | List available transitions            | Medium                                                                                                                                           |
| `transitionJiraIssue`              | Execute a transition                  | Very High — has nested `transition`, `fields`, `update`, `historyMetadata` with nested `actor`/`generator`/`cause` objects (~80 lines of schema) |
| `addCommentToJiraIssue`            | Add comment (markdown)                | Low-Medium — has `commentVisibility` object                                                                                                      |
| `addWorklogToJiraIssue`            | Log time                              | Medium                                                                                                                                           |
| `getJiraIssueRemoteIssueLinks`     | Get external links (Confluence, etc.) | Low                                                                                                                                              |
| `getVisibleJiraProjects`           | List projects user can access         | Medium — has `searchString`, `action` filter, pagination, `expandIssueTypes`                                                                     |
| `getJiraProjectIssueTypesMetadata` | Get issue types for a project         | Low                                                                                                                                              |
| `getJiraIssueTypeMetaWithFields`   | Get create-field metadata             | Medium                                                                                                                                           |
| `lookupJiraAccountId`              | Find user by name/email               | Low                                                                                                                                              |

#### Confluence Tools (11)

| Tool                              | Description                                    |
| --------------------------------- | ---------------------------------------------- |
| `getConfluencePage`               | Get page by ID (body as markdown)              |
| `createConfluencePage`            | Create page (body must be markdown)            |
| `updateConfluencePage`            | Update page (requires current `versionNumber`) |
| `getConfluenceSpaces`             | List spaces with filtering                     |
| `getPagesInConfluenceSpace`       | List pages in a space                          |
| `getConfluencePageDescendants`    | Get child pages                                |
| `getConfluencePageFooterComments` | List footer comments                           |
| `getConfluencePageInlineComments` | List inline comments                           |
| `createConfluenceFooterComment`   | Add footer comment                             |
| `createConfluenceInlineComment`   | Add inline comment with text selection         |
| `searchConfluenceUsingCql`        | CQL search                                     |

#### Rovo / Shared Platform Tools (4)

| Tool                              | Description                                           |
| --------------------------------- | ----------------------------------------------------- |
| `atlassianUserInfo`               | Get current user details                              |
| `getAccessibleAtlassianResources` | Get cloudId(s)                                        |
| `search`                          | Rovo natural language search across Jira + Confluence |
| `fetch`                           | Fetch by ARI (Atlassian Resource Identifier)          |

#### Compass Tools (6) — EXCLUDE from plugin

| Tool                                 | Description         |
| ------------------------------------ | ------------------- |
| `createCompassComponent`             | Create component    |
| `createCompassComponentRelationship` | Create relationship |
| `createCompassCustomFieldDefinition` | Create custom field |
| `getCompassComponent`                | Get component       |
| `getCompassComponents`               | Search components   |
| `getCompassCustomFieldDefinitions`   | List custom fields  |

---

## Research: Schema Weight Analysis

The heaviest tool schemas by token cost (estimated from the JSON schema dump at https://gist.github.com/didier-durand/de20b1bd16b5789c302cabea127766ed):

1. **`transitionJiraIssue`** — ~800+ tokens. Contains deeply nested `historyMetadata` with `actor`, `generator`, `cause` sub-objects, each with 5 fields. Plus `fields`, `update` with nested array-of-objects.
2. **`createJiraIssue`** — ~400 tokens. Long description strings for `issueTypeName` and `assignee_account_id` explaining what they are and which tools to call first.
3. **`getConfluencePageInlineComments`** — ~300 tokens. Multiple enum arrays for status, sort, resolution.
4. **`getVisibleJiraProjects`** — ~300 tokens. Multiple optional params with long descriptions.
5. **`searchJiraIssuesUsingJql`** — ~250 tokens. Default field arrays embedded in schema.

The remaining tools are ~100-200 tokens each. Total across all 37: ~24,000+ tokens.

---

## Research: JQL Reference (embed in skill)

Common JQL patterns the agent needs to know:

```
# Assignment
assignee = currentUser()
assignee = "user@email.com"
assignee is EMPTY

# Status
status = "In Progress"
status != Done
status in ("To Do", "In Progress")
status changed TO "Done" AFTER startOfDay(-1)

# Issue type
issuetype = Bug
issuetype in (Bug, Story, Task)

# Priority
priority = High
priority >= High  (matches High and Highest)
priority in (High, Highest)

# Project
project = "PROJ"
project in (PROJ1, PROJ2, PROJ3)

# Sprint
sprint in openSprints()
sprint in closedSprints()
sprint = "Sprint 23"

# Dates
created >= -7d
created >= startOfWeek()
created >= "2025-01-01"
updated >= -24h
due < now()  (overdue)
due <= endOfWeek()
due is EMPTY

# Text search
text ~ "search term"  (searches summary + description + comments)
summary ~ "login"

# Labels and components
labels = "backend"
labels in ("backend", "urgent")
component = "API"

# Epic / parent
"Epic Link" = PROJ-50
parent = PROJ-50

# Ordering
ORDER BY priority DESC, updated DESC
ORDER BY created ASC
ORDER BY status ASC, priority DESC

# Combining
project = PROJ AND issuetype = Bug AND status != Done AND priority >= High
assignee = currentUser() AND sprint in openSprints()
```

Date functions: `now()`, `startOfDay()`, `endOfDay()`, `startOfWeek()`, `endOfWeek()`, `startOfMonth()`, `endOfMonth()`. Relative: `-1d`, `-7d`, `-1w`, `-1m`, `-1y`.

---

## Research: CQL Reference (embed in skill)

Common CQL patterns for Confluence:

```
# Title search
title = "Exact Title"
title ~ "partial match"

# Full text
text ~ "search term"

# Space filtering
space = "ENG"
space in ("ENG", "PROD", "OPS")

# Labels
label = "architecture"
label in ("runbook", "howto")

# Type
type = page
type = blogpost

# Dates
lastModified >= now("-7d")
created >= now("-30d")

# Creator/contributor
creator = "user@email.com"
contributor = "user@email.com"

# Ancestor (all pages under a parent)
ancestor = 12345678

# Combining
space = "ENG" AND label = "runbook" AND text ~ "deploy"
type = page AND lastModified >= now("-7d") ORDER BY lastModified DESC
```

---

## Research: CLI Tool Command Reference

### Atlassian ACLI Commands (Official, Jira only)

```
# Auth
acli jira auth login --web                    # OAuth browser flow

# Projects
acli jira project list                        # List all projects
acli jira project view PROJECT-KEY            # View project details

# Work Items (Issues)
acli jira workitem view KEY-123               # View issue
acli jira workitem view KEY-123 --json        # View as JSON
acli jira workitem view KEY-123 --fields "summary,status,assignee"  # Specific fields

acli jira workitem search --jql "project = TEAM" --json
acli jira workitem search --jql "project = TEAM" --fields "key,summary,assignee" --csv
acli jira workitem search --jql "project = TEAM" --count               # Just count
acli jira workitem search --jql "project = TEAM" --paginate            # Auto-paginate

acli jira workitem create --summary "New Task" --project "TEAM" --type "Task"
acli jira workitem create --from-json "workitem.json"     # Create from JSON file
acli jira workitem create-bulk --from-json "items.json"   # Bulk create

acli jira workitem edit --key "KEY-1" --summary "New Summary"
acli jira workitem edit --key "KEY-1,KEY-2" --assignee "user@email.com"  # Bulk edit
acli jira workitem edit --jql "project = TEAM" --assignee "user@email.com"  # Edit by JQL

acli jira workitem transition --key "KEY-1" --status "In Progress"
acli jira workitem transition --jql "project = TEAM AND status = 'To Do'" --status "In Progress"

acli jira workitem assign --key "KEY-1" --assignee "user@email.com"
acli jira workitem clone --key "KEY-1"
acli jira workitem delete --key "KEY-1"

# Comments
acli jira workitem comment-create --key "KEY-1" --body "Comment text"
acli jira workitem comment-list --key "KEY-1"

# Sprints
acli jira sprint list --board BOARD-ID
acli jira sprint view SPRINT-ID

# Boards
acli jira board list
acli jira board view BOARD-ID

# Fields
acli jira field list
acli jira field view FIELD-ID
```

Key ACLI advantages for agent use:

- `--json` flag on all commands → predictable structured output
- `--fields` flag → control verbosity at source (no post-processing needed)
- `--csv` flag → compact tabular format
- `--count` flag → just get counts without full results
- `--jql` on edit/transition → bulk operations in a single command
- `--yes` flag → skip confirmation prompts (critical for non-interactive agent use)
- `--paginate` flag → auto-handle pagination

### jira-cli by ankitpokhrel (Community, Jira only)

```
# Auth setup
export JIRA_API_TOKEN=your_token
jira init                          # Interactive setup

# Issues
jira issue list --jql "..." --plain --columns key,summary,status,assignee
jira issue view KEY-123
jira issue view KEY-123 --comments 5
jira issue create                  # Interactive
jira issue create -tBug -s"Summary" -yHigh -lbackend -a$(jira me)
jira issue move KEY-123 "In Progress"
jira issue move KEY-123 Done -RFixed -a$(jira me)
jira issue assign KEY-123 "user@email.com"
jira issue clone KEY-123 -s"Cloned summary"
jira issue link KEY-123 KEY-456 "Blocks"
jira issue comment add KEY-123 "Comment body"

# Sprints
jira sprint list --current
jira sprint list --prev
jira sprint list --next
jira sprint list --state active,closed

# Epics
jira epic list
jira epic add KEY-123 KEY-456      # Add issue to epic
```

Key jira-cli advantages:

- `--plain` flag → minimal output ideal for agent parsing
- `--columns` flag → select exactly which columns to show
- Auto-converts Atlassian Document Format → markdown
- Natural issue movement: `jira issue move KEY-123 "In Progress"`
- `$(jira me)` → returns current user ID inline

### No Confluence CLI Exists (as of Feb 2026)

- **ACLI**: Community request filed Dec 2025. Atlassian confirmed "no timeline."
- **jira-cli**: Jira-only by design.

For Confluence, the only options are:

1. Rovo MCP subagent (load only Confluence tools — 11 instead of 37)
2. Direct REST API via curl/Python scripts
3. Confluence REST API v2 base: `https://{site}.atlassian.net/wiki/api/v2/`

### Existing Project Worth Studying: netresearch/jira-skill

URL: https://github.com/netresearch/jira-skill

This project takes the "zero MCP overhead" approach for Jira. Instead of MCP tools, it uses Python scripts invoked via bash. Key design decisions:

- **Scripts in `scripts/core/`**: jira-validate.py, jira-issue.py, jira-search.py, jira-worklog.py
- **Scripts in `scripts/workflow/`**: jira-create.py, jira-transition.py, jira-comment.py, jira-sprint.py, jira-board.py
- **Scripts in `scripts/utility/`**: jira-fields.py, jira-user.py, jira-link.py
- All scripts support `--json`, `--quiet`, `--dry-run`, `--env-file`, `--debug`
- Auth via `~/.env.jira` file with API token
- Uses `uv run` for dependency management (no global installs needed)
- Two SKILL.md files: one for communication (API operations), one for syntax (wiki markup)
- The skill teaches the agent which scripts to call and with what arguments

This is an excellent reference for the "CLI/scripts instead of MCP" approach.

---

## Research: Atlassian MCP Connection Details

- **Server URL**: `https://mcp.atlassian.com/v1/mcp` (preferred) or `https://mcp.atlassian.com/v1/sse` (legacy)
- **Auth**: OAuth 2.1 via browser flow
- **Transport**: Streamable HTTP (recommended) via `mcp-remote` proxy
- **MCP config**:
  ```json
  {
    "mcpServers": {
      "atlassian": {
        "command": "npx",
        "args": ["-y", "mcp-remote", "https://mcp.atlassian.com/v1/mcp"]
      }
    }
  }
  ```
- **Auth flow**: On first use, `/mcp` → select atlassian → browser OAuth → token stored by mcp-remote
- **Token refresh**: Supposed to last 90 days of inactivity, but community reports 30-60 min timeouts (being fixed by Atlassian)

---

## Design Constraints

1. **Target**: Claude Code plugin system with agent skills architecture
2. **MCP server**: Official Atlassian Rovo MCP only (not community alternatives)
3. **Products**: Jira + Confluence (exclude Compass)
4. **Use cases**: Issue CRUD, sprint/planning workflows, JQL search/reporting, Confluence page ops
5. **Key metric**: Minimize idle context cost (currently ~24.5k tokens/message → target <300 tokens)
6. **Key metric**: Minimize per-operation cost by having the subagent return compact responses
7. **Key metric**: Reduce failed queries by embedding JQL/CQL reference in skills
8. **Key metric**: Reduce multi-step call chains by having the subagent auto-resolve lookups

## What to Build

Using the research above, context engineer a Claude Code plugin that:

### Phase 1: Investigate & Decide

1. **Test ACLI availability** — Can it be installed in the Claude Code compute environment? Test `acli jira auth login --web` and `acli jira workitem search --jql "..." --json`. If it works, this is likely the best Jira backend.
2. **Test jira-cli availability** — Can it be installed via `brew` or Go binary? Compare output format to ACLI.
3. **Test Rovo MCP isolation** — Can you configure it to expose ONLY Confluence tools? Or does it always load all 37?
4. **Decide the architecture**: CLI for Jira + MCP subagent for Confluence? All CLI/scripts? All MCP? Document your reasoning.

### Phase 2: Decompose Aggressively

Each skill should be as narrow and self-contained as possible. The more decomposed, the less context loaded per operation. Possible decomposition:

**Jira Skills:**

- `jira-issue-read` — View issue details, get linked issues
- `jira-issue-write` — Create, update, delete issues
- `jira-issue-transition` — Change status, workflow transitions
- `jira-issue-comment` — Add/list comments, add worklogs
- `jira-search` — JQL construction and execution
- `jira-sprint` — Sprint listing, sprint issues, current sprint
- `jira-planning` — Compound workflows: standup prep, workload review, my tasks
- `jira-project` — List projects, issue types, fields (setup/discovery)

**Confluence Skills:**

- `confluence-read` — Get page content, search pages (CQL)
- `confluence-write` — Create/update pages, add comments
- `confluence-browse` — List spaces, browse page trees

**Shared:**

- `atlassian-setup` — Auth, workspace discovery, session bootstrap

### Phase 3: Build Skills

For each skill:

- Write minimal metadata (name + description in ~40 tokens)
- Write the full skill body with exact CLI syntax OR subagent delegation instructions
- Embed relevant JQL/CQL reference snippets (only what that skill needs, not the full reference)
- Include error handling guidance
- Include 3-5 natural language trigger examples

### Phase 4: Test Token Efficiency

Measure and document:

- Idle cost (all skill metadata loaded, no operations)
- Per-operation cost (specific skill loaded + execution)
- Compare to baseline (raw Rovo MCP at ~24.5k tokens/message)
- Target: <300 tokens idle, <1000 tokens per operation

Study the Todoist plugin repo for skill/agent/subagent patterns, study netresearch/jira-skill for the CLI-scripts approach, then synthesize the best approach for this much larger Atlassian tool surface.
