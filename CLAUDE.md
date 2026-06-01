@AGENTS.md

## Project Brain — AUTO-UPDATE RULE

`PROJECT_BRAIN.md` is the single source of truth for this project. **Whenever you make any change to this codebase — new feature, bug fix, schema change, route added/removed, pattern introduced, open item resolved, or quirk discovered — you MUST update the relevant section(s) of `PROJECT_BRAIN.md` in the same response before you finish.** No exceptions.

What to update and where:
- New or changed feature → Section 8 (Feature Inventory)
- New/changed route → Section 7 (Route Map)
- New/changed DB table, column, trigger, or RPC → Section 5 (Database Schema)
- New/changed file or directory → Section 6 (Directory & File Map)
- New pattern or architectural decision → Section 9 (Key Implementation Patterns)
- Bug fixed or open item resolved → Section 11 (Open Items) — mark resolved or remove
- New quirk or gotcha discovered → Section 12 (Quirks & Gotchas)
- Anything shipped this session → Section 10 (Session Log) — add to current session block
- Security model change → Section 13
- Deployment/env var change → Section 14 or 15

Update the "Last updated" line at the bottom of `PROJECT_BRAIN.md` with today's date after every edit.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
