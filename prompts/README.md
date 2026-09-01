# prompts/

LLM prompts this project ships, versioned per OSS_SPEC §13.5: each prompt lives in its own directory as immutable `<major>_<minor>_<patch>.md` files with YAML front matter (`name`, `description`, `version` matching the filename) and `## System` / `## User` sections. Existing versions are never edited — every change is a new file at a bumped semver.

No prompts yet: the game has no LLM features, and the repo's agent guidance lives in [AGENTS.md](../AGENTS.md) and `.agents/skills/` instead. The first candidate for this directory is a stage-describer prompt (turning a generated stage's segment plan into pacenotes-style copy); when it lands it goes in `prompts/stage-pacenotes/1_0_0.md` following the format above.
