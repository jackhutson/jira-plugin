# Jira Plugin for Claude Code

A token-efficient Jira integration for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that uses the [Atlassian CLI (ACLI)](https://developer.atlassian.com/cloud/acli/) instead of MCP tool schemas. Idle cost is ~80 tokens compared to ~24,500 for the official Rovo MCP — a 99.7% reduction.

## How It Works

Instead of injecting dozens of tool schemas into every message, this plugin provides Claude Code **skills** — markdown procedures that are loaded on-demand. Skills invoke `acli` commands via bash, so there is zero MCP overhead.

Two execution modes are available per session:

- **Direct mode** — Claude runs ACLI commands in the main conversation. Fast for quick one-off operations.
- **Subagent mode** — Claude delegates to a specialist agent in a separate context window. Keeps the main conversation clean for bulk or multi-step workflows.

## Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed and configured
- A Jira Cloud instance you have access to (Jira Server and Data Center are not supported)

## Installation

### 1. Install the Atlassian CLI

The plugin requires the [Atlassian CLI (ACLI)](https://developer.atlassian.com/cloud/acli/), the official Atlassian command-line tool:

```bash
brew tap atlassian/homebrew-acli && brew install acli
```

> On Linux or Windows (WSL), see the [ACLI documentation](https://developer.atlassian.com/cloud/acli/guides/install-acli/) for alternative installation methods.

### 2. Authenticate with your Jira site

```bash
acli jira auth login
```

This launches an interactive wizard that walks you through authentication. You can also use `acli jira auth login --web` to authenticate directly via your browser.

> **Don't have ACLI yet?** That's fine — install the plugin first (step 3). A startup hook runs on every session and will tell you exactly what's missing and how to fix it. You can set up ACLI at any point; the plugin will detect it on the next session start or the first time you mention Jira.

### 3. Install the plugin

Plugin installation is a two-step process — add the marketplace, then install the plugin from it.

**From a local clone:**

```bash
git clone https://github.com/jackhutson/jira-plugin.git
```

Then inside Claude Code:

```
/plugin marketplace add ./jira-plugin
/plugin install jira@jira-marketplace
```

**From GitHub (no clone needed):**

```
/plugin marketplace add jackhutson/jira-plugin
/plugin install jira@jackhutson-jira-plugin
```

After installing, run `/reload-plugins` to load the skills.

### 4. Verify

Start a new Claude Code session. The plugin's startup hook automatically checks that ACLI is installed and authenticated — you'll see a warning with setup instructions if anything is missing.

You can also verify manually:

```bash
acli jira auth status
```

## Dependency Checks

The plugin checks for ACLI and valid authentication at two points:

1. **Session startup** — A hook runs automatically when Claude Code starts (and on resume/clear/compact). If ACLI is missing or auth has expired, it injects a warning with copy-pasteable setup commands into the session context.
2. **First Jira use** — The `jira` skill runs `acli jira auth status` before doing any work. If something is wrong, Claude will tell you what to run — it never attempts to authenticate on your behalf.

This means you can safely install the plugin before ACLI. Everything degrades gracefully with actionable guidance.

## Skills Reference

The plugin provides six skills, loaded only when needed:

| Skill | Trigger examples | What it does |
|---|---|---|
| **jira** | Any Jira mention | Entry point — checks prereqs, selects mode, routes to workflow skills |
| **jira-context** | "Show me PROJ-123", "pull context" | Fetches ticket details, subtasks, and comments as structured markdown |
| **jira-progress** | "Start working on X", "mark as done", "blocked" | Transitions a ticket through workflow stages (start, review, done, block, reopen) |
| **jira-work** | "Work on PROJ-123", "pick up X" | Claims a ticket, loads context, does the work, updates Jira throughout |
| **jira-decompose** | "Break this spec into tickets" | Analyzes a spec/plan and proposes an epic + child ticket hierarchy |
| **jira-workflow** | "Configure workflow for PROJ" | Discovers project workflow statuses and caches them for future use |

### Workflow Discovery

Different Jira projects use different status names. The first time you use `jira-progress` or `jira-work` on a project, the plugin detects it's unconfigured and offers two discovery paths:

1. **Auto-discover** — searches existing tickets to infer status names, proposes a mapping for your approval
2. **Rovo prompt** — generates a prompt you paste into Jira's Rovo AI to get the full workflow definition

Discovered workflows are cached in `config/workflows.json` so discovery only runs once per project.

## Project Structure

```
jira-plugin/
├── .claude/
│   └── settings.local.json   # Permissions whitelist for plugin tool access
├── .claude-plugin/
│   ├── plugin.json           # Plugin metadata
│   └── marketplace.json      # Distribution config
├── agents/
│   └── jira-agent.md         # Subagent for isolated ACLI execution
├── config/
│   ├── workflows.json.example # Seed template (copy to workflows.json)
│   └── workflows.json        # Your project workflow mappings (gitignored)
├── hooks/
│   ├── hooks.json            # SessionStart hook registration
│   ├── run-hook.cmd          # Cross-platform hook wrapper
│   └── session-start         # Checks ACLI install & auth on startup
├── skills/
│   ├── jira/                 # Entry skill: mode selection & routing
│   ├── jira-context/         # Pull ticket context
│   ├── jira-progress/        # Update ticket by workflow stage
│   ├── jira-decompose/       # Break spec into tickets
│   ├── jira-work/            # Claim & work a ticket end-to-end
│   └── jira-workflow/        # Discover & configure workflows
└── docs/
    └── plans/                # Design & implementation documents
```

## Configuration

### `config/workflows.json`

Maps project keys to their Jira workflow statuses. Populated automatically by the `jira-workflow` skill. A seed template is provided at `config/workflows.json.example` — copy it to get started:

```bash
cp config/workflows.json.example config/workflows.json
```

Example after discovery:

```json
{
  "projects": {
    "PL": {
      "statuses": {
        "start": "In Progress",
        "review": "In Review",
        "done": "Done",
        "block": "Blocked",
        "reopen": "To Do"
      }
    }
  }
}
```

You can edit this file manually if you prefer.

### `.claude/settings.local.json`

Permissions whitelist for the plugin's tool access (bash commands, web fetches to Atlassian domains). Installed with the plugin.

## Troubleshooting

**"ACLI not installed"** — Run `brew tap atlassian/homebrew-acli && brew install acli`

**"Authentication expired"** — Run `acli jira auth login`

**Transition fails with "status not found"** — Your project may use custom status names. Run `/jira-workflow` to re-discover and update the cached mapping.

**Permission denied on hooks** — Ensure the hook script is executable: `chmod +x hooks/session-start`

## License

MIT
