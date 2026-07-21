# Jira Plugin Installation & Architecture Validation — Design

**Date:** 2026-02-23
**Status:** Approved
**Context:** Post-mortem from Todoist MCP plugin auth flakiness informed this review

---

## Problem

The Todoist MCP plugin revealed that plugins declaring MCP servers via `.mcp.json` have inconsistent behavior: sometimes MCP tools don't register in the subagent, sometimes OAuth tokens don't persist across sessions. When auth fails silently, the agent exhibits "silent backpressure" — falling back to guessing raw API calls instead of reporting the failure.

The Jira plugin avoids MCP entirely (ACLI-backed), but needs:
1. Proper installation validation
2. A SessionStart hook for dependency/auth checking
3. Confirmation that the ACLI-only architecture is the optimal path

## Decision: ACLI-Only, No MCP

| Factor | ACLI Approach | MCP Approach |
|--------|--------------|--------------|
| Auth persistence | `~/.acli/` — managed by CLI, survives sessions | Claude Code MCP subsystem — flaky token persistence |
| Auth refresh | ACLI handles OAuth refresh silently | Requires re-auth via `/mcp` when token expires |
| Failure mode | Explicit: "command not found" or "auth failed" | Silent: tools disappear or return opaque errors |
| Idle token cost | ~80 tokens (skill metadata only) | ~24,500 tokens (37 MCP tool schemas) |
| External dependency | `brew install acli` (one-time) | None (HTTP MCP server) |
| Debugging | `acli jira auth status` — immediate answer | `/mcp` → check server status → unclear state |

**The ACLI approach wins on reliability.** The only cost is the Homebrew dependency, which a SessionStart hook can detect and guide.

## Architecture Changes

### 1. Add SessionStart Hook

**New files:**
- `hooks/hooks.json` — Hook registration
- `hooks/run-hook.cmd` — Cross-platform polyglot wrapper (bash + cmd)
- `hooks/session-start` — Dependency and auth check script

**Behavior:**

```
Session starts
    |
    v
which acli?
    |
    +-- NOT FOUND --> inject: "ACLI not installed. Run: brew tap atlassian/homebrew-acli && brew install acli"
    |
    +-- FOUND --> acli jira auth status
                    |
                    +-- AUTH FAILED --> inject: "Jira auth expired. Run: acli jira auth login --web --site <site>.atlassian.net"
                    |
                    +-- AUTH OK --> inject nothing (silent pass-through)
```

**Properties:**
- Runs every session start (~50ms when healthy)
- Non-destructive: only checks and informs, never installs or authenticates
- Injected context is visible to Claude, who can inform the user
- Zero noise when everything is healthy

### 2. Update Plugin File Structure

```
jira-plugin/
+-- .claude-plugin/
|   +-- plugin.json
|   +-- marketplace.json
+-- hooks/                          # NEW
|   +-- hooks.json                  # Hook registration
|   +-- run-hook.cmd                # Cross-platform wrapper
|   +-- session-start               # Dependency/auth check
+-- agents/
|   +-- jira-agent.md
+-- skills/
|   +-- jira/
|   |   +-- SKILL.md
|   +-- jira-context/
|   |   +-- SKILL.md
|   +-- jira-decompose/
|   |   +-- SKILL.md
|   +-- jira-progress/
|   |   +-- SKILL.md
|   +-- jira-work/
|       +-- SKILL.md
+-- docs/
    +-- plans/
```

### 3. Install via Local Directory Marketplace

For development/testing, register the local repo as a marketplace source (same pattern as `tux-plugins`):

```bash
claude plugin add-marketplace /Users/jackhutson/Documents/Code/jira-plugin
claude plugin install jira
```

Later, for distribution, push to GitHub and register as a git-based marketplace.

### 4. Uninstall Official Atlassian MCP Plugin

Already completed. This eliminates:
- 37 MCP tool schemas (~24,500 tokens idle)
- Routing conflicts between MCP tools and ACLI skills
- MCP auth flakiness for Jira operations

Confluence access is lost. If needed later, add `confluence-context` skill using ACLI (`acli confluence ...`).

## Verification Plan

After installation:
1. **Plugin discovery:** Skills appear in Claude Code's skill registry
2. **SessionStart hook fires:** Start a new session, confirm hook output
3. **ACLI missing path:** Temporarily mask `acli` from PATH, verify hook injects install guidance
4. **ACLI present, auth OK:** Verify silent pass-through (no injection)
5. **Skill triggering:** Say "show me PROJ-123" and confirm `jira` skill fires
6. **Subagent mode:** Choose subagent mode, verify `jira-agent` spawns and returns results
7. **Direct mode:** Choose direct mode, verify ACLI runs in main context

## Out of Scope

- Auto-installing ACLI via Homebrew (hooks should detect and inform, not act)
- Todoist plugin fixes (separate effort)
- Confluence support (future skill addition)
- Git-based marketplace publishing (do after local testing passes)
