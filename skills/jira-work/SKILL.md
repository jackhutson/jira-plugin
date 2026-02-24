---
name: jira-work
description: >
  Use when the user assigns a ticket to the agent, says "work on this ticket",
  "pick up this item", or wants the agent to claim a ticket and execute against
  it. Procedural harness that wraps any work with Jira discipline.
---

# Agent Works a Ticket (ACLI)

Procedural workflow that wraps any work the agent does with Jira discipline — claim at start, update when blocked, report at end. The skill defines WHEN to update Jira, not WHAT the work is.

## Status Resolution

Before any transition, look up the project in `config/workflows.json`:
1. Extract the project key from the issue key (e.g., `PL-3718` → `PL`)
2. Check if `projects.PROJECT_KEY` exists in the config
3. If not found → invoke the `jira-workflow` skill for this project, then re-read
4. Use the `statuses` mapping to resolve stage names (`start`, `block`, `done`) to actual Jira status names

## Procedure

### 1. CLAIM

Assign the ticket and signal that work is starting:

```
acli jira workitem assign --key "KEY-123" --assignee "user@email.com"
acli jira workitem transition --key "KEY-123" --status "START_STATUS" --yes
acli jira workitem comment-create --key "KEY-123" --body "Picked up by agent — starting work"
```

Where `START_STATUS` is resolved from `config/workflows.json` → `projects.PROJECT_KEY.statuses.start`.

If the ticket is already assigned to the current user, skip the assign step. If already in the start status, skip the transition.

### 2. CONTEXT

Load the full ticket context to understand what needs to be done:

```
acli jira workitem view KEY-123 --fields "key,summary,status,assignee,priority,issuetype,description" --json
acli jira workitem search --jql "parent = KEY-123" --fields "key,summary,status" --csv
acli jira workitem comment-list --key "KEY-123"
```

Parse from the description:
- Acceptance criteria or requirements
- Any linked resources or references
- Subtasks and their status

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
acli jira workitem transition --key "KEY-123" --status "BLOCK_STATUS" --yes
acli jira workitem comment-create --key "KEY-123" --body "Blocked: [describe the blocker]"
```

Where `BLOCK_STATUS` is resolved from `config/workflows.json` → `projects.PROJECT_KEY.statuses.block`.

Stop and report to the user.

**If a scope question arises:**
```
acli jira workitem comment-create --key "KEY-123" --body "Question: [the question]"
```
Ask the user before proceeding.

### 5. COMPLETE

When work is finished:

```
acli jira workitem comment-create --key "KEY-123" --body "Completed: [summary of what was done, what changed, any follow-ups]"
acli jira workitem transition --key "KEY-123" --status "DONE_STATUS" --yes
```

Where `DONE_STATUS` is resolved from `config/workflows.json` → `projects.PROJECT_KEY.statuses.done`.

If code was written, include the branch name or PR link in the completion comment.

The user can specify a preferred completion status (e.g., review instead of done). Resolve via the config mapping.

## Error Handling

If ACLI returns exit code != 0:
- "authentication failed" → Tell user: `acli jira auth login --web --site <site>.atlassian.net`
- "command not found: acli" → Tell user: `brew tap atlassian/homebrew-acli && brew install acli`
- "trace id:" prefix → Unexpected server error, report trace ID
- Transition failure → Check if transitions graph is configured. If so, report valid moves. If not, suggest Rovo discovery via `jira-workflow`.
- Other → Report raw error message
