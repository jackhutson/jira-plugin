# Create-time custom fields

Read this file only when work-item creation needs fields without direct ACLI
flags, such as story points, sprint, or components. The supported range is
`acli >=1.3.15,<2.0.0`.

Inspect the executable's current schema before building input:

```bash
acli jira workitem create --generate-json
```

ACLI's file format is not the raw Jira REST payload. A representative create
object is:

```json
{
  "summary": "Title",
  "projectKey": "TEAM",
  "type": "Story",
  "parentIssueId": "TEAM-100",
  "assignee": "@me",
  "description": {
    "type": "doc",
    "version": 1,
    "content": [
      {
        "type": "paragraph",
        "content": [{"type": "text", "text": "Description"}]
      }
    ]
  },
  "additionalAttributes": {
    "components": [{"id": "12345"}],
    "customfield_10020": 3,
    "customfield_10701": 16378
  }
}
```

Custom-field IDs vary by Jira site. Discover them from a known work item using
`workitem view --fields "*all" --json`, or ask the user. Never guess an ID.
Confirm that the observed value shape matches the intended field: components
are ID objects, story points are numeric, and sprint values use the site's
sprint field and ID.

Create with:

```bash
acli jira workitem create --from-json /path/to/workitem.json --json
```

Do not assume these attributes can be changed later: `edit --from-json` does
not expose arbitrary `additionalAttributes` in the supported range. Inspect
`acli jira workitem edit --generate-json` and direct unsupported changes to the
Jira UI rather than inventing a raw API workaround.
