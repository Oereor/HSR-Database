import { readFileSync } from 'node:fs';
import type { RatingV2BuildInput } from '../../../src/lib/relic-score/v2/normalize.js';

const base = JSON.parse(
  readFileSync('tests/fixtures/relic-score/player-builds/complete-five-star.json', 'utf8')
) as RatingV2BuildInput;

export function buildPlayerInput(): RatingV2BuildInput {
  return structuredClone(base);
}
