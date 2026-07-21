# Changelog

All notable changes to this project are documented in this file. The project
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-07-20

### Added

- Added ACLI-first routing, project-key inference, and a progressively disclosed
  ACLI command reference.
- Added workflow discovery, per-project status mappings, and default-project
  configuration.
- Added batch progress updates, required-field discovery, JSON-based story-point
  updates, and guardrails against repeated failing commands.
- Added one shared Jira mutation policy with exact-target previews, bulk and
  destructive confirmation gates, partial-outcome stops, and safety evals.
- Added offline PR validation for plugin/JSON/shell behavior and ACLI command
  contracts, plus isolated credentialed model evals for scheduled/manual runs.
- Declared ACLI `>=1.3.15,<2.0.0`, added bounded startup version diagnostics,
  minimum/latest CI coverage, and monthly actionable compatibility reporting.
- Added one machine-readable runtime helper for ACLI health, ticket-key
  resolution, and validated workflow configuration, with stable exit codes and
  concurrent-write coverage.
- Simplified execution to direct outcome-skill routing, removing the generic
  mode-selection skill and duplicated Jira subagent.
- Added canonical domain language and architecture decisions, and moved
  superseded implementation plans into a clearly non-normative archive.
- Reconciled README and marketplace metadata with the measured plugin inventory,
  and added editor schema associations for workflow and evaluation JSON.

### Fixed

- Fixed the SessionStart hook so `${CLAUDE_PLUGIN_ROOT}` expands before the hook
  wrapper runs, allowing installed copies to find their scripts.
- Made the SessionStart health check portable and bounded, with one ACLI call,
  minimal identity-safe success context, and distinct actionable failures.
- Corrected ACLI command flags and made transition/comment/assignment workflows
  preflight mutations and report partial results per ticket.
- Moved workflow mappings to atomic, validated `${CLAUDE_PLUGIN_DATA}` storage,
  scoped by Jira site and project key so configuration survives plugin updates.
- Removed duplicated authentication, error classification, key resolution, and
  persistence behavior from operational guidance.
- Hardened ACLI dependency and authentication checks with clearer success and
  recovery guidance.
- Corrected Jira comment creation to use the current `acli jira workitem comment
  create` command shape.

[1.1.0]: https://github.com/jackhutson/jira-plugin/releases/tag/jira--v1.1.0
