# Jira Plugin for Claude Code

A low-overhead Jira Cloud integration for
[Claude Code](https://docs.anthropic.com/en/docs/claude-code) that uses the
[Atlassian CLI (ACLI)](https://developer.atlassian.com/cloud/acli/) and loads
outcome-specific skills only when they are relevant.

## How It Works

Instead of injecting dozens of tool schemas into every message, this plugin provides Claude Code **skills** — markdown procedures that are loaded on-demand. Skills invoke `acli` commands via bash, so there is zero MCP overhead.

Jira requests route directly to the most specific skill. There is no session-wide
mode prompt or generic routing agent; each outcome skill owns one discoverable
workflow and the `acli` skill handles ad-hoc operations.

## Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed and configured
- [Node.js](https://nodejs.org/) 22 or newer
- Atlassian CLI `>=1.3.15,<2.0.0`; the startup hook rejects versions outside
  this tested range before checking authentication
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
/plugin install jira@jira-marketplace
```

After installing, run `/reload-plugins` to load the skills.
This reload is needed when installing into an already-running session; a new
Claude Code session loads installed plugins automatically.

### 4. Verify

Start a new Claude Code session. The plugin's startup hook performs bounded
ACLI version and authentication checks within one time budget. It reports the
ready Jira site/version or gives distinct guidance for installation,
unsupported versions, authentication, site-admin authorization, network,
timeout, and unexpected failures without exposing the authenticated identity.

From a local clone or development checkout, you can also verify manually:

```bash
node scripts/jira-plugin.mjs doctor --json
```

## Dependency Checks

The plugin checks for ACLI and valid authentication at two points:

1. **Session startup** — A hook runs automatically when Claude Code starts (and on resume/clear/compact). If ACLI is missing or auth has expired, it injects a warning with copy-pasteable setup commands into the session context.
2. **First Jira use** — The selected outcome skill calls the same runtime helper
   before doing any work. If something is wrong, Claude shows its stable
   recovery message — it never attempts to authenticate on your behalf.

This means you can safely install the plugin before ACLI. Everything degrades gracefully with actionable guidance.

The hook uses Bash on macOS/Linux or Git for Windows and delegates to the Node.js
runtime helper. It does not require GNU `timeout`. ACLI version and status each
run at most once and share an internal time budget inside Claude Code's outer
hook timeout.

## Skills Reference

The plugin provides six directly discoverable skills, loaded only when needed:

| Skill | Manual invocation | Trigger examples | What it does |
|---|---|---|---|
| **jira-context** | `/jira:jira-context` | "Show me PROJ-123", "pull context" | Fetches ticket details, subtasks, and comments as structured markdown |
| **jira-progress** | `/jira:jira-progress` | "Start working on X", "mark as done", "blocked" | Transitions a ticket through workflow stages (start, review, done, block, reopen) |
| **jira-work** | `/jira:jira-work` | "Work on PROJ-123", "pick up X" | Claims a ticket, loads context, does the work, updates Jira throughout |
| **jira-decompose** | `/jira:jira-decompose` | "Break this spec into tickets" | Analyzes a spec/plan and proposes an epic + child ticket hierarchy |
| **jira-workflow** | `/jira:jira-workflow` | "Configure workflow for PROJ" | Discovers project workflow statuses and caches them for future use |
| **acli** | `/jira:acli` | "Search Jira with JQL", sprint/board/project operations | Handles ad-hoc Jira operations from the verified ACLI reference |

### Measured plugin footprint

<!-- plugin-details: skills=acli,jira-context,jira-decompose,jira-progress,jira-work,jira-workflow; agents=0; hooks=1; always-on=373; claude=2.1.216; measured=2026-07-20 -->

Measured on 2026-07-20 with Claude Code 2.1.216 by running
`claude --plugin-dir . plugin details jira`: six skills, zero agents, one
harness-only SessionStart hook, and approximately 373 always-on tokens. The
largest skill, `acli`, is approximately 840 tokens when invoked; its optional
references are loaded only for the relevant operation. These are Claude Code's
rounded projections, not a comparison with an unrelated integration, and may
change with the host's estimator.

### Workflow Discovery

Different Jira projects use different status names. The first time you use `jira-progress` or `jira-work` on a project, the plugin detects it's unconfigured and offers two discovery paths:

1. **Auto-discover** — searches existing tickets to infer status names, proposes a mapping for your approval
2. **Rovo prompt** — generates a prompt you paste into Jira's Rovo AI to get the full workflow definition

Discovered workflows are stored through the shared runtime helper, scoped by
authenticated Jira site and project key, so discovery survives plugin updates
and identical project keys on different sites stay independent.

## Project Structure

```
jira-plugin/
├── .claude-plugin/
│   ├── plugin.json           # Plugin metadata
│   └── marketplace.json      # Distribution config
├── config/
│   └── workflows.json.example # Immutable persistent-state schema example
├── hooks/
│   ├── hooks.json            # SessionStart hook registration
│   ├── run-hook.cmd          # Cross-platform hook wrapper
│   └── session-start         # Checks ACLI install & auth on startup
├── scripts/
│   ├── jira-plugin.mjs       # Shared machine-readable runtime interface
│   ├── acli-version.mjs      # Internal ACLI compatibility implementation
│   └── workflow-config.mjs   # Internal validated, atomic storage implementation
├── skills/
│   ├── acli/                 # Ad-hoc guidance + opt-in supporting references
│   ├── jira-context/         # Pull ticket context
│   ├── jira-progress/        # Update ticket by workflow stage
│   ├── jira-decompose/       # Break spec into tickets
│   ├── jira-work/            # Claim & work a ticket end-to-end
│   └── jira-workflow/        # Discover & configure workflows
├── CONTEXT.md                # Canonical Jira plugin domain language
└── docs/
    ├── adr/                  # Maintained architecture decisions
    └── archive/plans/        # Non-normative historical plans
```

## Mutation safety

Read-only Jira requests can run directly. Mutations follow the single policy in
[`docs/mutation-safety.md`](docs/mutation-safety.md): bulk, destructive, and
hard-to-reverse work pauses on an exact-target preview; `--yes` is only an ACLI
execution flag after authorization. Mutating skills do not pre-approve Bash
commands, while the read-only context skill pre-approves only its ACLI reads.

## Configuration

### Persistent workflow configuration

The `jira-workflow` skill manages configuration through
`scripts/jira-plugin.mjs`; callers never resolve, read, repair, or write the
backing file directly. Configuration is scoped first by authenticated Jira
hostname, then by project key. A confirmed project configuration can be stored
and made the site's default for bare ticket numbers in one atomic operation:

```bash
node scripts/jira-plugin.mjs config set \
  --site example.atlassian.net --project PL \
  --from-json project-workflow.json --default --json
```

[`config/workflows.json.example`](config/workflows.json.example) is an immutable
schema example only, associated with
[`schemas/workflows.schema.json`](schemas/workflows.schema.json) for editor
validation. The helper validates input, serializes concurrent access, and
replaces persistent state atomically. Malformed existing state and failed
writes remain untouched and return distinct machine-readable errors. See
[`docs/runtime-helper.md`](docs/runtime-helper.md) for the complete interface.

## Troubleshooting

**"ACLI not installed"** — Run `brew tap atlassian/homebrew-acli && brew install acli`

**"ACLI version is unsupported"** — Install or upgrade to the tested range
`>=1.3.15,<2.0.0`, then confirm with `acli --version`.

**"Authentication expired"** — Run `acli jira auth login`

**"Site admin must re-authorize"** — ACLI 1.3.15 added OAuth scopes that need
site approval. A Jira site admin must update ACLI, run `acli jira auth login`,
choose the Web flow, and select the affected site.

The plugin itself never starts interactive authentication. The helper performs
a read-only health check and leaves login or account switching to the user.

**Transition fails with "status not found"** — Your project may use custom status names. Run `/jira:jira-workflow` to re-discover and update the cached mapping.

**Permission denied on hooks** — For a local clone, ensure the hook is executable
with `chmod +x hooks/session-start`. For a marketplace installation, update the
marketplace and reinstall the plugin so Claude Code refreshes its cached copy.

## Validation and evals

The local runner mirrors the four required PR jobs. Install Node.js 22, Claude
Code 2.1.216, ShellCheck, and a supported ACLI binary, then run:

```bash
ACLI_BIN="$(command -v acli)" bash scripts/validate.sh all
```

Individual groups make failures faster to isolate:

```bash
bash scripts/validate.sh plugin    # strict plugin, JSON, JS syntax, release metadata
bash scripts/validate.sh shell     # bash -n, ShellCheck, all SessionStart branches
bash scripts/validate.sh behavior  # storage, workflow, safety, and eval contracts
ACLI_BIN="$(command -v acli)" bash scripts/validate.sh contract
```

The plugin group also checks the README inventory against live
`plugin details` output and performs an isolated clean marketplace install.

Maintainers can verify that the three main gates fail actionably, without
opening or polluting a real PR, with `bash scripts/verify-ci-failures.sh`. It
uses isolated temporary copies to break a manifest, a hook JSON response, and
an ACLI help contract.

The PR workflow is fully offline with respect to Jira and model APIs. It runs
the model-eval manifest and scorer against fixtures, but never sends repository
content to a model. Credentialed model evals are isolated in the manual/monthly
`Model evals` workflow and skip cleanly when `ANTHROPIC_API_KEY` is absent. To
run them intentionally, set that variable securely in the environment and run:

```bash
node scripts/run-model-evals.mjs
```

Those evals expose only `Skill` and `Read`; Jira and filesystem mutation tools
are denied. Cases cover routing, concise output, mutation confirmation,
anti-flailing, and partial-failure reporting.

PR CI runs the ACLI command contract against both `1.3.15-stable` and the latest
stable binary. A separate monthly compatibility workflow runs the full suite on
latest stable and opens or updates a `bug` issue with the failed run and required
maintenance steps when drift is detected.

## Releases

See [CHANGELOG.md](CHANGELOG.md) for release notes and
[docs/RELEASING.md](docs/RELEASING.md) for the version-bump, validation, smoke
test, and tagging workflow. Explicit plugin versions are cache keys, so every
published code change must use a new semantic version.

## Architecture and domain language

- [CONTEXT.md](CONTEXT.md) defines the canonical Jira-site, project, work-item,
  workflow-mapping, stage, plugin-data, and mutation vocabulary.
- [Architecture decisions](docs/adr/README.md) record the durable integration,
  storage, execution, safety, and release choices.
- [Runtime helper](docs/runtime-helper.md),
  [mutation safety](docs/mutation-safety.md), and
  [ACLI command contracts](docs/acli-command-contracts.md) describe maintained
  operational boundaries.

Historical plans are archived for context only and are not implementation
instructions.

## License

MIT
