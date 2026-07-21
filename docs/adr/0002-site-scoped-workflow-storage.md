# Scope workflow mappings by site and project

Workflow mappings are keyed by Jira site and project and live in durable plugin
data behind the runtime helper, not in the versioned installation. This prevents
same-key projects on different sites from colliding and preserves user-approved
mappings across upgrades, at the cost of explicit site resolution and a storage
schema owned by the helper.
