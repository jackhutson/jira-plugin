---
name: jira-progress
description: >
  Use when work on a ticket has reached a stage boundary — started working,
  sent for review, completed, blocked, or reopened. Handles status transition,
  comment, and field updates in one pass.
---

# Update Ticket by Workflow Stage (ACLI)

Transitions a ticket's status and adds a meaningful comment describing what happened — all in one pass. The comment is the valuable part; a bare status change is cheap.

Before any mutation, read and apply
`${CLAUDE_PLUGIN_ROOT}/docs/mutation-safety.md`. State the planned transition,
comment, and assignment before execution.

## Ticket Reference

Before any ACLI operation, normalize each supplied key or number with the shared
helper and use only `data.key` from a successful result:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/jira-plugin.mjs" resolve-key "TICKET_OR_NUMBER" --site "SITE" --json
```

Omit `--site` for an explicit key. For a bare number, use the site established
by SessionStart or `doctor`; pass `--project` only when the user supplied it.
Show the helper's `message` and stop on failure—never reproduce its inference.

## Stages

| Stage | User says | Comment guidance |
|-------|-----------|-----------------|
| `start` | "start working on", "pick up" | What you're about to do |
| `review` | "send for review", "ready for review" | What was done, what to review |
| `done` | "mark as done", "complete", "finished" | Summary of what was accomplished |
| `block` | "blocked on", "stuck" | What the blocker is and who can unblock |
| `reopen` | "reopen", "needs more work" | Why it's being reopened |

## Batch Operations

When the user mentions multiple tickets in one request (e.g., "set 3529 to done, 2692 to done, 3365 to in progress"):

1. **Parse all ticket/status pairs** from the user's message
2. **Resolve ticket keys** — run every supplied reference through the shared helper above
3. **Group by target stage** — tickets going to the same status can be batched.
4. **Preflight every ticket before any mutation:**
   - Resolve the authenticated Jira site and load that site's project mapping.
   - Fetch current statuses in one search: `acli jira workitem search --jql "key in (K1,K2,K3)" --fields "key,status" --json`.
   - Exclude missing tickets and tickets already in the target status.
   - When `transitions` is configured, exclude tickets whose current-to-target move is invalid.
   - Check `required_fields` for the target status. ACLI transition cannot supply them, so exclude those tickets and report the required fields instead of attempting the transition.
5. **Preview the exact batch and wait for confirmation:** show the target status,
   every eligible key, excluded keys with reasons, and the planned per-ticket
   comments. Freeze the approved eligible keys; a changed set needs a new
   preview.
6. **Transition only the confirmed frozen keys**, requesting per-ticket output:
   ```bash
   acli jira workitem transition --key "K1,K2" --status "TARGET" --yes --ignore-errors --json
   ```
7. **Reconcile every requested key:** parse the JSON result per ticket. If the
   output is missing or malformed, fetch the eligible tickets' statuses once
   more and compare them with the preflight snapshot. Mark a transition as
   successful only when ACLI explicitly reports success or when a ticket moved
   from its previous status to the target status. Never infer rollback from a
   nonzero batch exit.
8. **Continue only if every eligible transition succeeded.** On any failed or
   unknown outcome, stop before comments and report the partial result. When the
   transition phase fully succeeds, comment each confirmed success and track
   comment success separately. A failed comment does not roll back a transition;
   stop before any later follow-on mutation.
9. **Report every ticket's actual outcome:**
   ```
   UX-3529: IN PROGRESS → DONE | Comment added
   UX-2692: transition failed; remains IN REVIEW | No comment
   UX-3365: GROOMED → IN PROGRESS | Comment failed: permission denied
   ```

Partial success is committed state. Report it accurately; never say the batch
rolled back unless ACLI explicitly proves that it did.

## Procedure (single ticket)

1. **Determine the stage** from the user's intent using the table above
2. **Extract the project key** from the issue key (e.g., `PL-3718` → `PL`)
3. **Resolve the authenticated Jira site:** use the hostname from SessionStart
   context, or run the shared helper's `doctor --json`. If `data.sites` has
   multiple entries and the target is ambiguous, ask the user. Never infer a
   site from a project key.
4. **Load the site/project mapping:**
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/jira-plugin.mjs" config get --site "SITE" --project "PROJECT_KEY" --json
   ```
   - `CONFIG_NOT_FOUND` → invoke `jira-workflow` for this site and project, then run the command again
   - any other error → show the helper's `message` and stop
5. **Resolve the stage to the actual Jira status** using
   `data.configuration.statuses.STAGE` from the helper result
6. **Fetch current status before mutation:**
   `acli jira workitem view KEY-123 --fields "status" --json`.
7. **Validate the transition** (if `transitions` is configured for this project):
   - Check if the target status is in the list of valid transitions from the current status
   - If not valid, report: "Can't transition from CURRENT to TARGET. Valid moves: [list]. You may need to transition through an intermediate status."
8. **Check required fields before mutation:** read `required_fields` for the
   target status from the returned project object. If it lists any fields, do
   not attempt the transition: ACLI 1.3.x cannot supply transition fields.
   Report the required field names and direct the user to Jira.
9. **Transition status and request parseable output:**
```
acli jira workitem transition --key "KEY-123" --status "RESOLVED_STATUS" --yes --json
```
   Parse the result. On a nonzero or malformed result, re-fetch status once and
   report the observed state. Continue only when success is confirmed.
10. **Add a comment after confirmed transition success** — compose from context, not a canned string:
```
acli jira workitem comment create --key "KEY-123" --body "Started work on the API refactor — focusing on the auth endpoints first"
```
   If comment creation fails or its result is unknown, stop before assignment
   and report the committed transition plus the comment outcome.
11. **Self-assign only after confirmed transition success** when the stage is
    `start` and the user asked to claim the ticket:
```
acli jira workitem assign --key "KEY-123" --assignee "@me" --yes --json
```
   For an explicit assignee, pass only the email or account ID resolved from the
   user's input; never substitute a placeholder.
12. **Confirm each side effect separately:**
    `KEY-123: PREVIOUS_STATUS → RESOLVED_STATUS | Comment added | Assigned to @me`.
    If the comment or assignment failed, report the successful transition plus
    that failure; do not imply rollback.

## Error Handling

If ACLI fails, run the shared helper's `doctor --json`. When doctor fails, show
its `message` and stop. When doctor is healthy, report the exact failed command
and stderr as an operation error. For an invalid transition, use the configured
graph when present; otherwise suggest Rovo discovery. Retry at most once only
when correcting known invalid input.
