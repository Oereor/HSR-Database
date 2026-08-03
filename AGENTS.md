# AGENTS.md

## Repository boundaries

* This repository contains the HSR database website.
* Only create or modify files inside `HSR-Database/`.
* `../TurnBasedGameData/` is a separate upstream Git repository and must be treated as read-only.
* Never edit, format, move, delete, stage, commit, reset, clean, or switch branches in `../TurnBasedGameData/`.
* Never initialize a Git repository in the shared parent directory.
* Do not convert the upstream repository into a submodule or subtree unless explicitly requested.
* Use `git -C HSR-Database ...` and `git -C TurnBasedGameData ...` when commands are executed from the shared parent directory.

## Data rules

* Use only real data discovered in `../TurnBasedGameData/`.
* Do not invent characters, items, skills, statistics, IDs, descriptions, translations, or relationships.
* Keep raw-data parsing separate from UI components.
* Read the upstream README and LICENSE before copying or redistributing data or assets.
* Write generated data, reports, caches, and temporary analysis files only inside this repository.
* Configure the upstream path through `HSR_DATA_ROOT`, with `../TurnBasedGameData` as the documented local default.

## Development rules

* Prefer SvelteKit, TypeScript, Vite, Tailwind CSS, and pnpm unless this repository already uses another suitable stack.
* Use strict TypeScript types derived from the actual upstream data.
* Keep parsing, normalization, domain models, generated data, and presentation components separated.
* Do not add unnecessary backend services, databases, authentication, or production dependencies.
* Maintain responsive design, keyboard accessibility, reduced-motion support, and missing-data fallbacks.

## Required checks

After changing data-processing code, run the data validation and synchronization checks.

Before finishing, run the applicable commands for:

* formatting;
* linting;
* TypeScript checking;
* unit tests;
* browser tests;
* production build.

Finally verify that `../TurnBasedGameData/` has the same Git status it had before the task began.
