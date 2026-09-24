import { readFileSync } from 'node:fs';
import type { PlayerBuildInput } from '../../../src/lib/relic-score/types.js';

const base = JSON.parse(
  readFileSync('tests/fixtures/relic-score/player-builds/complete-five-star.json', 'utf8')
) as PlayerBuildInput;

export function buildPlayerInput(): PlayerBuildInput {
  return structuredClone(base);
}
