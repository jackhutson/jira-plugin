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

## Procedure

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
7. **Add a comment** — compose from context, not a canned string:
```
acli jira workitem comment-create --key "KEY-123" --body "Started work on the API refactor — focusing on the auth endpoints first"
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
