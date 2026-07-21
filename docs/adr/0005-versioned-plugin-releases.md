# Version every published plugin change

Every published code change receives a new semantic plugin version, and manifest
and marketplace versions remain identical. Claude Code resolves that version as
an installation-cache key, so reusing a published version can strand users on
older contents; release tags are therefore immutable and created only after the
release-critical set passes validation.
