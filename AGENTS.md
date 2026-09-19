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
- Data generation supports `zh-CN` and `en` from their matching pinned TextMaps; public website routes and loaders remain Simplified-Chinese-only until an explicit product change.
- Paraglide compiles manually maintained `zh-CN` and `en` Site Messages. Use explicit locale message calls. Do not add mutable locale state, language switching, localized routing, cross-locale TextMap fallback, or locale detection/redirects.
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

## Verification discipline

- Do not add tests that pin exact production copy for site messages or changelog entries. These user-maintained texts may change frequently; test generic locale, loader, or manifest logic with synthetic fixtures instead.
- Verification must be risk-based and targeted. Start with the smallest deterministic checks that cover the code changed in the current task; do not run every available test layer by default.
- Prefer targeted test files, test-name filters, or Vitest `related --run` / `--changed` when suitable. Run the full unit-test suite only when the change affects shared foundations broadly, targeted results indicate cross-cutting risk, or the task is at an explicit phase/PR/merge/release boundary.
- Do not duplicate the same assertion across unit, component, browser, deployment, and manual checks without a distinct risk being covered at each layer. Prefer the lowest-cost layer that can verify the behavior reliably.
- Browser/E2E tests are required only for behavior that actually depends on browser integration, navigation, responsive behavior, accessibility interaction, or other cross-component behavior. Start with the directly relevant specs rather than the whole browser suite.
- Production/deployment builds are not a default check for every edit. Run them when the change can affect generated output, data preparation, routing, deployment configuration, serverless Functions, or other build-time behavior, or when the task explicitly requires a phase-boundary build.
- Do not repeatedly diagnose or rerun known pre-existing failures that are unrelated to the current diff. Record them once, distinguish them from regressions, and continue with the checks relevant to the current task.
- Do not re-verify unchanged subsystems or remote behaviors that were already closed in an earlier phase unless the current change can reasonably affect them.
- External-tool and authentication failures are stop conditions, not invitations to loop. After one clear failed attempt caused by environment, permissions, Deployment Protection, unavailable browser automation, or similar external constraints, stop that verification path, report what remains unverified, and provide a concise manual verification checklist. Do not spend extended time trying alternate bypasses.
- Remote Vercel deployments are opt-in. Do not run `vercel deploy`, `vercel --prod`, or create a Preview deployment merely as a routine finishing check. Prefer local checks, `vercel build --target=preview`, and `vercel deploy --dry` where they provide sufficient evidence.
- A remote Preview deployment is allowed only when the task explicitly requires validation of behavior that cannot be established locally or from the build output. By default, create at most one Preview deployment per task. A second Preview is justified only after a concrete platform-specific defect was found and fixed; explain the reason before redeploying. Production deployment always requires explicit user approval.
- Do not disable or weaken Vercel Deployment Protection, create persistent automation-bypass credentials, or modify project protection settings just to complete automated verification. If protection blocks the required wire-level check, hand that small check to the user instead.
- Keep verification proportional to the change. Once the implementation and relevant targeted checks are green, do not add extra test/build/deploy cycles solely to obtain a more exhaustive-looking report.

## Required checks

Current architecture source of truth: [docs/architecture/localization-and-data-generation.md](docs/architecture/localization-and-data-generation.md). Phase and audit reports are historical/non-normative.

Choose checks according to the surface changed; "applicable" does not mean "run every command below on every task."

- For changed source files, run targeted formatting/linting and the relevant TypeScript/Svelte checks.
- For logic changes, run the directly related unit tests first; expand to broader tests only when the change or failures justify it.
- After changing data-processing code, run the relevant data validation and synchronization checks.
- After changing visual-asset processing, verify both successful asset resolution and missing-asset fallback behavior.
- After changing routing, generated route output, deployment configuration, or Vercel Functions, run the relevant route/build checks such as `vercel build --target=preview`; a remote Preview is not implied.
- After changing browser-visible interaction or responsive/navigation behavior, run the directly relevant browser tests.
- Run a full production build only when the change can affect production build output or when explicitly required for a phase/PR/merge/release gate.
- Run the full unit/browser regression suites only at an explicit broad regression boundary or when targeted verification identifies cross-cutting risk.
- Before finishing, inspect the final diff/status and ensure the checks actually exercised the changed behavior.

Finally verify that both external repositories have the same Git status they had before the task began:

- `../TurnBasedGameData/`
- `../StarRailRes/`
