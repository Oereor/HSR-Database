# Tracked enemy asset snapshot

This directory is generated at maintenance time and intentionally committed to Git.
Production, Preview and CI consume it offline; do not edit its mappings or binaries manually.

- Source service: <https://static.nanoka.cc>
- Resource type: `MonsterFigure`
- Public URL: `/generated-enemy-assets/figures/Monster_<imageId>.webp`
- Encoding: WebP, quality 82, longest edge at most 1280 px, with transparency preserved. The updater keeps an eligible original if recompression saves less than 5%.
- Update: `pnpm update:enemy-assets`
- Validate offline: `pnpm validate:enemy-assets`

The repository MIT license does not cover these third-party game assets. This file records
provenance only and does not assert an upstream redistribution license.
