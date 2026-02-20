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

| Stage | User says | Status | Comment guidance |
|-------|-----------|--------|-----------------|
| `start` | "start working on", "pick up" | → In Progress | What you're about to do |
| `review` | "send for review", "ready for review" | → In Review | What was done, what to review |
| `done` | "mark as done", "complete", "finished" | → Done | Summary of what was accomplished |
| `block` | "blocked on", "stuck" | → Blocked | What the blocker is and who can unblock |
| `reopen` | "reopen", "needs more work" | → To Do | Why it's being reopened |

## Procedure

1. **Determine the stage** from the user's intent using the table above
2. **Transition status:**
```
acli jira workitem transition --key "KEY-123" --status "In Progress" --yes
```
3. **Add a comment** — compose from context, not a canned string:
```
acli jira workitem comment-create --key "KEY-123" --body "Started work on the API refactor — focusing on the auth endpoints first"
```
4. **Update fields** if relevant (e.g., claim assignee on `start`):
```
acli jira workitem edit --key "KEY-123" --assignee "user@email.com" --yes
```
5. **Confirm:** `KEY-123: To Do → In Progress | Comment added`

Status names are project-specific. If a transition fails, report the error — the status name may differ in the user's workflow.

## Error Handling

If ACLI returns exit code != 0:
- "authentication failed" → Tell user: `acli jira auth login --web --site <site>.atlassian.net`
- "command not found: acli" → Tell user: `brew tap atlassian/homebrew-acli && brew install acli`
- Invalid status/transition → Report error, suggest checking available statuses
- "trace id:" prefix → Unexpected server error, report trace ID
- Other → Report raw error message
