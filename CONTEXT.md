# Jira Operations

This context translates user intent into safe work in Jira while preserving the
site- and project-specific meaning needed to interpret that work.

## Language

**Jira site**:
An Atlassian Cloud tenancy, uniquely identified by its hostname. A Jira site can
contain many projects, and the same project key can exist on different sites.
_Avoid_: Jira instance, account

**Project**:
A Jira work container within one Jira site, identified by a project key.
_Avoid_: Repository, workspace

**Workflow mapping**:
An approved association between intent-level stages and a project's Jira status
names, optionally including allowed transitions and required fields.
_Avoid_: Workflow config, status cache

**Stage**:
An intent-level point in the lifecycle of work, such as start, review, done,
blocked, or reopened, independent of a project's chosen status name.
_Avoid_: Status, state

**Work item**:
A unit of tracked Jira work addressed by a key. “Ticket” is an accepted
conversational synonym; ACLI and maintained documentation prefer work item.
_Avoid_: Issue

**Plugin data**:
Durable state owned by an installed plugin and retained across plugin-version
changes.
_Avoid_: Plugin cache, repository config

**Mutation**:
An operation that changes Jira state, including work-item, project, comment,
assignment, workflow, or planning-resource state.
_Avoid_: Command, write
