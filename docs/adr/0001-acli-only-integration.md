# Use ACLI as the Jira integration boundary

The plugin integrates with Jira through Atlassian CLI rather than an MCP server
or direct REST client. ACLI keeps the always-on tool surface small and supplies
the upstream command/authentication contract, while accepting a runtime binary
dependency and requiring compatibility tests against the supported range.
