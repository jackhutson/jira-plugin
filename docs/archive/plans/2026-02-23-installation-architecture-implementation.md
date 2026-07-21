# Jira Plugin Installation & Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a SessionStart hook for dependency/auth detection, install ACLI, register the plugin as a local marketplace, install it, and verify the full chain works.

**Architecture:** Three hook files (hooks.json, cross-platform wrapper, session-start script) detect ACLI installation and auth status at session start, injecting guidance into context when something is missing. The plugin is registered as a local directory marketplace and installed via `claude plugin install`. No MCP, no `.mcp.json`.

**Tech Stack:** Bash (hooks), Claude Code plugin system, Homebrew (ACLI dependency)

**Design doc:** `docs/plans/2026-02-23-installation-architecture-design.md`

---

### Task 1: Create hooks directory and hooks.json

**Files:**
- Create: `hooks/hooks.json`

**Step 1: Create the hook registration file**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "'${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd' session-start",
            "async": false
          }
        ]
      }
    ]
  }
}
```

**Step 2: Verify the file is valid JSON**

Run: `python3 -c "import json; json.load(open('hooks/hooks.json')); print('VALID')"`
Expected: `VALID`

**Step 3: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat: add SessionStart hook registration"
```

---

### Task 2: Create cross-platform hook wrapper

**Files:**
- Create: `hooks/run-hook.cmd`

This is the polyglot bash/cmd wrapper (identical pattern to superpowers plugin at `~/.claude/plugins/cache/claude-plugins-official/superpowers/4.3.1/hooks/run-hook.cmd`).

**Step 1: Create the wrapper script**

```bash
: << 'CMDBLOCK'
@echo off
REM Cross-platform polyglot wrapper for hook scripts.
REM On Windows: cmd.exe runs the batch portion, which finds and calls bash.
REM On Unix: the shell interprets this as a script (: is a no-op in bash).

if "%~1"=="" (
    echo run-hook.cmd: missing script name >&2
    exit /b 1
)

set "HOOK_DIR=%~dp0"

REM Try Git for Windows bash in standard locations
if exist "C:\Program Files\Git\bin\bash.exe" (
    "C:\Program Files\Git\bin\bash.exe" "%HOOK_DIR%%~1" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)
if exist "C:\Program Files (x86)\Git\bin\bash.exe" (
    "C:\Program Files (x86)\Git\bin\bash.exe" "%HOOK_DIR%%~1" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)

REM Try bash on PATH
where bash >nul 2>nul
if %ERRORLEVEL% equ 0 (
    bash "%HOOK_DIR%%~1" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)

REM No bash found - exit silently
exit /b 0
CMDBLOCK

# Unix: run the named script directly
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_NAME="$1"
shift
exec bash "${SCRIPT_DIR}/${SCRIPT_NAME}" "$@"
```

**Step 2: Make it executable**

Run: `chmod +x hooks/run-hook.cmd`

**Step 3: Commit**

```bash
git add hooks/run-hook.cmd
git commit -m "feat: add cross-platform hook wrapper"
```

---

### Task 3: Create session-start hook script

**Files:**
- Create: `hooks/session-start`

**Step 1: Create the session-start script**

```bash
#!/usr/bin/env bash
# SessionStart hook for jira plugin
# Checks ACLI installation and Jira auth status, injects guidance if needed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

escape_for_json() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="${s//$'\n'/\\n}"
    s="${s//$'\r'/\\r}"
    s="${s//$'\t'/\\t}"
    printf '%s' "$s"
}

message=""

# Check 1: Is acli installed?
if ! command -v acli &>/dev/null; then
    message="⚠️ **Jira Plugin: ACLI not installed.** The Jira plugin requires the Atlassian CLI. Install it with:\n\n\`\`\`\nbrew tap atlassian/homebrew-acli && brew install acli\n\`\`\`\n\nThen authenticate:\n\n\`\`\`\nacli jira auth login --web --site <your-site>.atlassian.net\n\`\`\`"
else
    # Check 2: Is Jira auth valid?
    if ! acli jira auth status &>/dev/null; then
        message="⚠️ **Jira Plugin: Authentication expired.** Re-authenticate with:\n\n\`\`\`\nacli jira auth login --web --site <your-site>.atlassian.net\n\`\`\`"
    fi
fi

# If no issues, output minimal success JSON and exit
if [ -z "$message" ]; then
    cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": ""
  }
}
EOF
    exit 0
fi

# Inject guidance into session context
escaped_message=$(escape_for_json "$message")

cat <<EOF
{
  "additional_context": "${escaped_message}",
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "${escaped_message}"
  }
}
EOF

exit 0
```

**Step 2: Make it executable**

Run: `chmod +x hooks/session-start`

**Step 3: Test the script directly (ACLI not installed)**

Run: `bash hooks/session-start`
Expected: JSON output containing "ACLI not installed" message (since acli is not yet on this machine)

**Step 4: Verify the output is valid JSON**

Run: `bash hooks/session-start | python3 -c "import sys,json; d=json.load(sys.stdin); print('VALID'); print('has_context:', bool(d.get('additional_context','')))"`
Expected:
```
VALID
has_context: True
```

**Step 5: Commit**

```bash
git add hooks/session-start
git commit -m "feat: add session-start hook for ACLI dependency check

Checks if acli is installed and Jira auth is valid.
Injects guidance into session context when issues detected.
Silent pass-through when everything is healthy."
```

---

### Task 4: Install ACLI via Homebrew

**Files:** None (system dependency)

**Step 1: Tap the Atlassian Homebrew repo**

Run: `brew tap atlassian/homebrew-acli`
Expected: `==> Tapping atlassian/homebrew-acli` or already tapped

**Step 2: Install acli**

Run: `brew install acli`
Expected: Installation output ending with success

**Step 3: Verify installation**

Run: `acli --version`
Expected: Version string (e.g., `acli/1.x.x`)

**Step 4: Test the session-start hook again (ACLI installed, no auth)**

Run: `bash hooks/session-start | python3 -c "import sys,json; d=json.load(sys.stdin); ctx=d.get('additional_context',''); print('auth_warning' if 'expired' in ctx or 'Authentication' in ctx else 'no_warning' if not ctx else 'other'); print(ctx[:100] if ctx else 'clean')"`
Expected: `auth_warning` (ACLI installed but not yet authenticated)

---

### Task 5: Authenticate ACLI to Jira

**Files:** None (user credential setup)

**Step 1: Run the auth flow**

Run: `acli jira auth login --web --site <your-site>.atlassian.net`

Replace `<your-site>` with your actual Atlassian site name. This opens a browser for OAuth consent.

Expected: Browser opens, user completes OAuth, terminal shows success.

**Step 2: Verify auth status**

Run: `acli jira auth status`
Expected: Shows authenticated status with site name

**Step 3: Test the session-start hook (fully healthy)**

Run: `bash hooks/session-start | python3 -c "import sys,json; d=json.load(sys.stdin); ctx=d.get('additional_context',''); print('CLEAN' if not ctx else 'ISSUE:', ctx[:80])"`
Expected: `CLEAN` (no context injected — silent pass-through)

---

### Task 6: Register plugin as local marketplace and install

**Files:** None (Claude Code configuration)

**Step 1: Register the local directory as a marketplace**

Run: `claude plugin add-marketplace /Users/jackhutson/Documents/Code/jira-plugin`
Expected: Marketplace registered successfully

**Step 2: Install the jira plugin**

Run: `claude plugin install jira`
Expected: Plugin installed successfully

**Step 3: Verify installation**

Run: `claude plugin list`
Expected: `jira` appears in the installed plugins list

---

### Task 7: End-to-end verification

**Files:** None (manual testing)

**Step 1: Start a fresh Claude Code session**

Run: `claude` (new session)

Expected: SessionStart hook fires. If ACLI + auth are healthy, no warning appears. If either is missing, guidance is injected.

**Step 2: Test skill triggering**

In the Claude Code session, say: "Show me my Jira tickets"

Expected: The `jira` entry skill fires, detects intent, presents direct vs subagent mode choice.

**Step 3: Test direct mode**

Choose direct mode, then ask: "Search for issues assigned to me"

Expected: Agent runs `acli jira workitem search --jql "assignee = currentUser()" ...` and returns results.

**Step 4: Test subagent mode**

Say "switch to subagent", then ask: "What's in the current sprint?"

Expected: `jira-agent` spawns, loads skills, runs ACLI commands, returns compact summary.

**Step 5: Verify no MCP overhead**

Confirm no MCP tool schemas appear in the conversation. The only tools should be Claude Code's built-in tools + any other installed plugins. No Atlassian/Jira MCP tools.
