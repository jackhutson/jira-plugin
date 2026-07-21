---
name: jira-work
description: >
  Use when the user assigns a ticket to the agent, says "work on this ticket",
  "pick up this item", or wants the agent to claim a ticket and execute against
  it. Procedural harness that wraps any work with Jira discipline.
---

# Agent Works a Ticket (ACLI)

Procedural workflow that wraps any work the agent does with Jira discipline — claim at start, update when blocked, report at end. The skill defines WHEN to update Jira, not WHAT the work is.

Before any Jira mutation, read and apply
`${CLAUDE_PLUGIN_ROOT}/docs/mutation-safety.md`. State every claim, transition,
and comment that will run before starting the chain.

## Ticket Reference

Before any ACLI operation, normalize the supplied key or number with the shared
helper and use only `data.key` from a successful result:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/jira-plugin.mjs" resolve-key "TICKET_OR_NUMBER" --site "SITE" --json
```

Omit `--site` for an explicit key. For a bare number, use the site established
by SessionStart or `doctor`; pass `--project` only when the user supplied it.
Show the helper's `message` and stop on failure—never reproduce its inference.

## Status Resolution

Before any transition, load persistent configuration for the authenticated Jira
site and project:

1. Extract the project key from the issue key (e.g., `PL-3718` → `PL`)
2. Resolve the exact site hostname from SessionStart context or the shared
   helper's `doctor --json`. If `data.sites` has multiple entries and the target
   is ambiguous, ask the user; never infer a site from the project key.
3. Run:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/jira-plugin.mjs" config get --site "SITE" --project "PROJECT_KEY" --json
   ```
4. On `CONFIG_NOT_FOUND`, invoke `jira-workflow` for this site/project, then run
   it again. On any other error, show the helper's `message` and stop.
5. Use the returned `data.configuration.statuses` mapping to resolve stage names (`start`,
   `block`, `done`) to actual Jira status names.
6. Before any mutation, fetch the current status and validate the requested
   move against `transitions` when configured. Check `required_fields` for the
   target status; if any are required, stop because ACLI cannot supply
   transition fields.

## Procedure

### 1. CLAIM

Assign the ticket and signal that work is starting:

```
acli jira workitem assign --key "KEY-123" --assignee "@me" --yes --json
acli jira workitem transition --key "KEY-123" --status "START_STATUS" --yes --json
acli jira workitem comment create --key "KEY-123" --body "Picked up by agent — starting work"
```

Where `START_STATUS` is resolved from the returned project's `statuses.start`.

If the ticket is already assigned to the current user, skip assignment. If it is
already in the start status, skip transition and do not claim that a transition
occurred. Execute each remaining command only after the prior command succeeds.
If transition fails after assignment, report "assigned, transition failed" and
do not add the picked-up comment.

### 2. CONTEXT

Load the full ticket context to understand what needs to be done:

```
acli jira workitem view KEY-123 --fields "key,summary,status,assignee,priority,issuetype,description" --json
acli jira workitem search --jql "parent = KEY-123" --fields "key,summary,status" --csv
acli jira workitem comment list --key "KEY-123" --limit 5 --order -created --json
```

Parse from the description:
- Acceptance criteria or requirements
- Subtasks and their status
- Five newest comments

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
acli jira workitem transition --key "KEY-123" --status "BLOCK_STATUS" --yes --json
acli jira workitem comment create --key "KEY-123" --body "Blocked: [describe the blocker]"
```

Where `BLOCK_STATUS` is resolved from the returned project's `statuses.block`.

Add the comment only after confirmed transition success. Stop and report each
side effect separately; a comment failure does not roll back the transition.

**If a scope question arises:**
```
acli jira workitem comment create --key "KEY-123" --body "Question: [the question]"
```
Ask the user before proceeding.

### 5. COMPLETE

When work is finished:

```
acli jira workitem transition --key "KEY-123" --status "DONE_STATUS" --yes --json
acli jira workitem comment create --key "KEY-123" --body "Completed: [summary of what was done, what changed, any follow-ups]"
```

Where `DONE_STATUS` is resolved from the returned project's `statuses.done`.

If code was written, include the branch name or PR link in the completion comment.

The user can specify a preferred completion status (e.g., review instead of
done). Resolve via the config mapping. Add the completion comment only after
confirmed transition success. If the comment fails, report that the transition
succeeded and the comment failed; never claim rollback.

## Error Handling

If ACLI fails, run the shared helper's `doctor --json`. When doctor fails, show
its `message` and stop. When doctor is healthy, report the exact failed command
and stderr as an operation error. For a transition failure, use the configured
graph when present; otherwise suggest Rovo discovery. Retry at most once only
when correcting known invalid input.
