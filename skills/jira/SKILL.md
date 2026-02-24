---
name: jira
description: >
  Use when the user mentions Jira, issues, tickets, sprints, work items,
  or any project management task involving Atlassian. Routes to workflow
  skills or delegates to jira-agent subagent.
---

# Jira CLI Plugin (ACLI)

## Prereq Check (First Use Per Session)

Run via bash:
```
acli jira auth status
```

- **If auth fails:** Tell the user to run: `acli jira auth login --web --site <site>.atlassian.net`
- **If acli not found:** Tell the user to run: `brew tap atlassian/homebrew-acli && brew install acli`
- Do NOT automate auth — just check and inform.

## Mode Selection (First Jira Invocation Per Session)

Present two options to the user:

- **Direct mode:** "I'll run ACLI commands directly. Faster per-operation but output accumulates in our conversation. Best for a few quick operations."
- **Subagent mode:** "I'll delegate to a Jira specialist agent in a separate context. Slightly slower per-operation but keeps our conversation clean. Best for bulk work or many operations."

Remember the user's choice for the rest of the session. The user can say "switch to direct/subagent" to change mid-session.

## Workflow Routing

| User intent | Skill |
|---|---|
| "Show me ticket X", "pull context for X", "what's in X" | `jira-context` |
| "Start working on X", "mark X as done", "X is blocked", "send for review" | `jira-progress` |
| "Break this spec into tickets", "create tickets from this plan" | `jira-decompose` |
| "Work on X", "pick up X", "agent handle X" | `jira-work` |
| "Configure workflow for X", "set up statuses", "refresh workflow" | `jira-workflow` |

## Ad-hoc Operations

For intents that don't match a workflow (e.g., "just create a blank ticket", "search for bugs in PROJ", "delete PROJ-99"), handle directly using ACLI:

- **Create:** `acli jira workitem create --summary "..." --project "PROJ" --type "Task" --yes`
- **Search:** `acli jira workitem search --jql "..." --fields "key,summary,status,assignee" --csv`
- **Edit:** `acli jira workitem edit --key "KEY-123" --summary "..." --yes`
- **Delete:** `acli jira workitem delete --key "KEY-123" --yes`

Always use `--yes` to skip confirmations and `--fields` to control output size.

## Direct Mode

1. Invoke the relevant workflow skill or run ad-hoc ACLI commands
2. Present results to the user

## Subagent Mode

1. Spawn `jira-agent` via the Task tool with the user's request
2. The agent loads workflow skills and executes ACLI commands
3. Present the agent's compact summary to the user
