import { readFileSync } from 'node:fs';
import type { RelicSlot } from '../../../src/lib/domain/types.js';
import type { PlayerStatTarget } from '../../../src/lib/player/property-semantics.js';
import type { RelicStatKey } from '../../../src/lib/relic-score/stat-registry.js';
import type {
  NormalizedRelicPiece,
  PlayerBuildInput,
  RollCountEvidence
} from '../../../src/lib/relic-score/types.js';

const base = JSON.parse(
  readFileSync('tests/fixtures/relic-score/player-builds/complete-five-star.json', 'utf8')
) as PlayerBuildInput;

export function buildPlayerInput(): PlayerBuildInput {
  return structuredClone(base);
}

export function withRelic(
  input: PlayerBuildInput,
  slot: RelicSlot,
  update: (relic: NormalizedRelicPiece) => void
): PlayerBuildInput {
  const next = structuredClone(input);
  const relic = next.relics.find((piece) => piece.slot === slot);
  if (!relic) throw new Error(`Missing fixture slot ${slot}`);
  update(relic);
  return next;
}

export function withoutSlot(input: PlayerBuildInput, slot: RelicSlot): PlayerBuildInput {
  return { ...structuredClone(input), relics: input.relics.filter((piece) => piece.slot !== slot) };
}

export function withMainStat(
  input: PlayerBuildInput,
  slot: RelicSlot,
  key: RelicStatKey
): PlayerBuildInput {
  return withRelic(input, slot, (relic) => {
    relic.mainStat.key = key;
  });
}

export function withRollEvidence(
  input: PlayerBuildInput,
  slot: RelicSlot,
  evidence: RollCountEvidence
): PlayerBuildInput {
  return withRelic(input, slot, (relic) => {
    relic.substats[0].rollCount = evidence;
  });
}

export function withPanelTarget(
  input: PlayerBuildInput,
  stat: PlayerStatTarget,
  value: number
): PlayerBuildInput {
  return { ...structuredClone(input), panel: { ...input.panel, [stat]: value } };
}
