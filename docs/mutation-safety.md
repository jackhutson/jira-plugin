# Jira mutation safety policy

This is the single authorization policy for every Jira mutation performed by
this plugin. Command examples elsewhere describe syntax; they never override
this policy.

## Classify the request

- **Read-only:** searches, views, comment lists, status checks, and other reads
  may run without an extra confirmation.
- **Explicit, single, targeted mutation:** a reversible mutation of one exact
  Jira object may run when the user directly requested that action and supplied
  or approved the resolved target and new value.
- **Ambiguous mutation:** if the action, target, user, or value is not exact,
  ask for clarification. Do not guess and do not mutate.
- **Confirmation-gated mutation:** bulk, destructive, or hard-to-reverse work
  always requires the preview and confirmation gate below. This includes more
  than one Jira object, multi-ticket creation, deletion, archiving, project
  deletion, and mutations selected by JQL or a saved filter.

An implicit follow-on mutation, such as adding a progress comment after a
requested transition, must be stated before any mutation runs. It does not need
a separate confirmation when it is reversible, affects the same single target,
and the primary mutation was explicitly requested. Otherwise it uses the
confirmation gate.

## Preview and confirmation gate

Resolve targets with read-only commands, then show:

```text
Action: <operation and new value>
Targets (<count>): <exact Jira keys, comment IDs, project keys, or other IDs>
Follow-ons: <every additional mutation, or none>
Irreversible effects: <effects, or none>
Proceed with exactly these targets?
```

Wait for an explicit confirmation of that preview. Approval applies once to
the displayed action, values, and frozen target set. Any material change or
new target requires a new preview and confirmation.

Never broaden explicit keys into a JQL or filter mutation. For a JQL or filter
request, run a read-only query to resolve and display every exact key, then use
those frozen keys for the mutation after confirmation. If ACLI cannot mutate
the frozen target set explicitly, stop and explain the limitation.

`--yes` only suppresses an ACLI prompt after authorization. It is never user
authorization and never replaces the preview gate.

## Execution and partial outcomes

Request parseable output and reconcile each target. If a command or sequential
workflow fails or has an unknown outcome, stop before any new mutation phase.
Do not add a success comment or perform another follow-on mutation after a
partial failure. Report each target as succeeded, failed, unknown, or not
attempted, including any already-committed effects; never claim rollback unless
ACLI proves it.
