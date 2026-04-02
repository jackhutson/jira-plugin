---
name: jira-progress
description: >
  Use when work on a ticket has reached a stage boundary — started working,
  sent for review, completed, blocked, or reopened. Handles status transition,
  comment, and field updates in one pass.
---

# Update Ticket by Workflow Stage (ACLI)

Transitions a ticket's status and adds a meaningful comment describing what happened — all in one pass. The comment is the valuable part; a bare status change is cheap.

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
2. **Resolve ticket keys** — apply project prefix inference (see jira skill) for bare numbers
3. **Group by target stage** — tickets going to the same status can be batched
4. **For each stage group:**
   - Resolve the stage to the actual Jira status via `config/workflows.json`
   - Validate transitions for all tickets (fetch current statuses in one search: `acli jira workitem search --jql "key in (K1,K2,K3)" --fields "key,status" --json`)
   - Transition in a single command: `acli jira workitem transition --key "K1,K2" --status "TARGET" --yes --ignore-errors`
   - Add individual comments for each ticket (one command per ticket)
5. **Report results** for each ticket:
   ```
   UX-3529: IN PROGRESS → DONE | Comment added
   UX-2692: IN REVIEW → DONE | Comment added
   UX-3365: GROOMED → IN PROGRESS | Comment added
   ```

## Procedure (single ticket)

1. **Determine the stage** from the user's intent using the table above
2. **Extract the project key** from the issue key (e.g., `PL-3718` → `PL`)
3. **Look up the project in `config/workflows.json`:**
   - Read the file at `config/workflows.json` (relative to the plugin root)
   - Check if `projects.PROJECT_KEY` exists
   - **If not found → invoke the `jira-workflow` skill** for this project. After it completes, re-read the config and continue.
4. **Resolve the stage to the actual Jira status** using `projects.PROJECT_KEY.statuses.STAGE`
5. **Validate the transition** (if `transitions` is configured for this project):
   - Get the ticket's current status: `acli jira workitem view KEY-123 --fields "status" --json`
   - Check if the target status is in the list of valid transitions from the current status
   - If not valid, report: "Can't transition from CURRENT to TARGET. Valid moves: [list]. You may need to transition through an intermediate status."
6. **Transition status:**
```
acli jira workitem transition --key "KEY-123" --status "RESOLVED_STATUS" --yes
```
6b. **Check required fields** — read `required_fields` from `config/workflows.json` for the target status:
   - If the target status has required fields (e.g., `"DONE": ["resolution"]`), note that ACLI cannot set these fields via CLI (verified limitation in acli v1.3.x). Warn the user: "Note: The resolution field is required for DONE but cannot be set via ACLI. It may be set automatically by your workflow, or you can set it manually in Jira."
   - After transition, verify by checking: `acli jira workitem view KEY-123 --fields "resolution" --json` — if the workflow auto-set it, no action needed.
7. **Add a comment** — compose from context, not a canned string:
```
acli jira workitem comment create --key "KEY-123" --body "Started work on the API refactor — focusing on the auth endpoints first"
```
8. **Update fields** if relevant (e.g., claim assignee on `start`):
```
acli jira workitem edit --key "KEY-123" --assignee "user@email.com" --yes
```
9. **Confirm:** `KEY-123: PREVIOUS_STATUS → RESOLVED_STATUS | Comment added`

## Error Handling

If ACLI returns exit code != 0:
- "authentication failed" → Tell user: `acli jira auth login --web --site <site>.atlassian.net`
- "command not found: acli" → Tell user: `brew tap atlassian/homebrew-acli && brew install acli`
- Invalid status/transition → Report error. If transitions are configured, show valid moves. If not, suggest running `jira-workflow` with the Rovo path to capture the full transition graph.
- "trace id:" prefix → Unexpected server error, report trace ID
- Other → Report raw error message
- **After any error:** If you have already retried once, stop and report the error to the user. Do not attempt alternative approaches or workarounds.
