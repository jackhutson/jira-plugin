# Releasing

Claude Code uses the resolved plugin version as its installation-cache key. This
repository uses explicit semantic versions, so every change intended for
installed users must ship with a version newer than every version they may have
cached. Pushing code while reusing a published version leaves those users on the
older cached copy.

The version in `.claude-plugin/plugin.json` is authoritative and must match the
`jira` entry in `.claude-plugin/marketplace.json`. Use semantic versioning:

- `MAJOR` for incompatible behavior or configuration changes.
- `MINOR` for backward-compatible capabilities.
- `PATCH` for backward-compatible fixes.

## Release checklist

1. Choose an unpublished semantic version. Check both Git tags and GitHub
   releases, including prereleases.
2. Set that version in `.claude-plugin/plugin.json` and in the `jira`
   marketplace entry.
3. Add the release notes to `CHANGELOG.md`.
4. Run the automated release checks from the repository root:

   ```bash
   node scripts/check-release.mjs
   bash scripts/smoke-test-install.sh
   node scripts/smoke-test-update.mjs
   claude --plugin-dir . plugin details jira
   ```

   The first command runs strict plugin validation and rejects missing or
   divergent manifest and marketplace versions. The install smoke test follows
   the local marketplace/install path from a clean isolated configuration. The
   update smoke test installs an isolated `1.0.0` fixture, updates its local
   marketplace to the working-tree version, and verifies that Claude Code selects
   the new cache entry. Both use temporary `CLAUDE_CONFIG_DIR` and
   `CLAUDE_CODE_PLUGIN_CACHE_DIR` directories; they do not change the developer's
   installed plugins.
5. Commit all files intended for the release and ensure the working tree is
   clean. Re-run the checks on the release commit.
6. Preview the annotated tag and confirm its name and commit:

   ```bash
   claude plugin tag --dry-run .
   ```

7. Only after all intended release-critical changes are present, create and
   push the tag:

   ```bash
   claude plugin tag . --push
   ```

8. Create the GitHub release from the generated `jira--vVERSION` tag using the
   matching `CHANGELOG.md` section. From a clean test configuration, add this
   GitHub marketplace, update the `jira@jira-marketplace` plugin, and confirm
   `claude plugin list --json` reports the released version.

Never force or move a published release tag. If release contents change after a
version has been cached, bump the version again and publish a new tag.
