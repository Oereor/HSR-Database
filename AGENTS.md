# AGENTS.md

## Internet connectivity

Due to special network environment, all Internet-related operations must go through proxy; By default the port is `7890`, but you should verify first.

## Repository boundaries

- This repository contains the HSR database website.
- The shared workspace normally contains three sibling Git repositories:

  - `HSR-Database/`: the website repository and the only repository that may be modified.
  - `../TurnBasedGameData/`: authoritative structured game data and TextMap source; read-only.
  - `../StarRailRes/`: visual asset source; read-only.

- Only create or modify files inside `HSR-Database/`.
- `main` branch of `HSR-Database/` is protected; all edits must be performed on `develop` branch. If the current branch is not `develop`, check out to `develop` before making any changes. Any operation that could change the state of `main` branch must get approved before performed.
- Never edit, format, move, delete, stage, commit, reset, clean, or switch branches in `../TurnBasedGameData/` or `../StarRailRes/`.
- Never initialize a Git repository in the shared parent directory.
- Do not convert either external repository into a submodule or subtree unless explicitly requested.
- When commands are executed from the shared parent directory, use explicit repository paths, for example:

  - `git -C HSR-Database ...`
  - `git -C TurnBasedGameData ...`
  - `git -C StarRailRes ...`

## Data rules

- `../TurnBasedGameData/` is the authoritative source for structured game data.
- Use only real game data discovered in `../TurnBasedGameData/`.
- Do not use StarRailRes index files as a replacement source for character, skill, trace, light-cone, enemy, stat, or relationship data unless explicitly requested.
- Do not invent characters, items, skills, statistics, IDs, descriptions, translations, or relationships.
- The website supports Simplified Chinese only and normally reads only `TextMap/TextMapCHS.json`.
- Do not add locale state, language switching, an i18n framework, or fallback TextMaps.
- Keep TextMap hashes as decimal strings throughout the data pipeline; never pass them through JavaScript `number`.
- Keep raw-data parsing separate from UI components.
- Use the shared TextMap resolver instead of accessing TextMap records from business code.
- Never bundle the complete upstream data repository or a complete TextMap into browser code.
- Materials, ordinary items, upgrade costs, and enemy drops are intentionally outside the website domain; do not reintroduce them without an explicit product decision.
- Classify and group character skills from structured config fields and SkillTree/servant relations, not Chinese name matching or character-specific ID rules.
- Character and light-cone level stats use normalized promotion stages; at ascension boundaries select the highest reached promotion stage.
- Prefer targeted build-time extraction for large upstream JSON files.
- Write generated data, reports, caches, and temporary analysis files only inside this repository.
- Configure the game-data source through `HSR_DATA_ROOT`, with `../TurnBasedGameData` as the documented local default.

## Visual asset rules

- `../StarRailRes/` is a visual asset source, not an authoritative game-data source.
- Prefer stable game IDs such as `AvatarID` when associating visual assets with normalized domain records; do not maintain Chinese-name-to-filename mappings when an ID-based mapping is available.
- Prefer the smallest asset appropriate for the UI. For example, use avatar icons for overview cards rather than full character portraits.
- Copy or generate only the assets actually needed by the website; never copy, bundle, or ship the complete StarRailRes repository.
- Browser/runtime code must not depend on sibling-repository filesystem paths. External visual assets must enter the application through the existing build/static asset pipeline.
- Missing visual assets must fail gracefully and must not produce broken-image UI or prevent a build.
- Do not use StarRailRes index files to silently create a second application data model.
- Read the README and LICENSE of both external repositories before copying or redistributing their data or assets.
- Configure the visual asset source through `HSR_ASSET_ROOT`, with `../StarRailRes` as the documented local default.

## Development rules

- Prefer SvelteKit, TypeScript, Vite, Tailwind CSS, and pnpm unless this repository already uses another suitable stack.
- Use strict TypeScript types derived from the actual upstream data.
- Keep parsing, normalization, domain models, generated data, visual-asset resolution, and presentation components separated.
- Do not add unnecessary backend services, databases, authentication, or production dependencies.
- Maintain responsive design, keyboard accessibility, reduced-motion support, and missing-data fallbacks.
- Keep each character limited to one card per semantic skill category; variants and independent progressions remain inside that card.
- Preserve established product and data invariants when performing visual-only refactors; do not change working business logic merely to simplify presentation code.

## Required checks

After changing data-processing code, run the data validation and synchronization checks.

After changing visual-asset processing, verify both successful asset resolution and missing-asset fallback behavior.

Before finishing, run the applicable commands for:

- formatting;
- linting;
- TypeScript checking;
- unit tests;
- browser tests;
- production build.

Finally verify that both external repositories have the same Git status they had before the task began:

- `../TurnBasedGameData/`
- `../StarRailRes/`
