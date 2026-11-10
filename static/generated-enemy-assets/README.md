# Tracked enemy asset snapshot

This directory is generated at maintenance time and intentionally committed to Git.
Production, Preview and CI consume it offline; do not edit its mappings or binaries manually.

- Source service: <https://static.nanoka.cc>
- `MonsterMiddleIcon` supplies card artwork at `/generated-enemy-assets/icons/Monster_<imageId>.webp`. The updater keeps the original WebP.
- `MonsterFigure` supplies detail hero artwork at `/generated-enemy-assets/figures/Monster_<imageId>.webp`. The updater uses WebP quality 82, caps the longest edge at 1280 px, and preserves transparency. It keeps an eligible original if recompression saves less than 5%.
- Manifest schema 5 stores one template-to-image mapping and separate digests for each resource type. A `null` digest records a missing image of that type. The detail hero can fall back to MiddleIcon.
- Update: `pnpm update:enemy-assets`
- Validate offline: `pnpm validate:enemy-assets`

The repository MIT license does not cover these third-party game assets. This file records
provenance only and does not assert an upstream redistribution license.
