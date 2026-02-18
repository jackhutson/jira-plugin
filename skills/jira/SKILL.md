---
name: jira
description: >
  Use when the user mentions Jira, issues, tickets, sprints, JQL, standup
  prep, project management tasks, or any Atlassian work item operation.
  Routes to domain-specific ACLI skills or delegates to jira-agent subagent.
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

## Skill Routing

| User intent | Skill to invoke |
|---|---|
| View, create, edit, delete, assign, clone issue | `jira-issue` |
| Search, find, list, query, JQL | `jira-search` |
| Move, transition, change status | `jira-transition` |
| Sprint, board, current sprint | `jira-sprint` |
| Standup, my tasks, workload, planning | `jira-planning` |

## Direct Mode

1. Invoke the relevant skill from the routing table above using the Skill tool
2. Run ACLI commands directly via bash following the skill's guidance
3. Present results to the user

## Subagent Mode

1. Spawn `jira-agent` via the Task tool with the user's request
2. The agent loads the relevant skills itself and executes ACLI commands
3. Present the agent's compact summary to the user
