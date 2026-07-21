# Authorize mutations by exact target

Jira mutations use one shared policy: explicit single reversible changes may
proceed after the action and follow-ons are stated, while bulk, destructive, or
hard-to-reverse work requires an exact-target preview and confirmation. Selector
results are frozen into keys before mutation, and partial success stops later
mutation phases because Jira operations cannot be assumed transactional.
