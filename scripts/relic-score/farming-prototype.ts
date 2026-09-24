import { gzipSync } from 'node:zlib';
import type { RelicSlot } from '../../src/lib/domain/types.js';
import type { RelicStatKey } from '../../src/lib/relic-score/stat-registry.js';
import {
  encodeDenseQuantiles,
  measureQuantileError
} from '../../src/lib/relic-score/farming/dense-quantile.js';
import {
  farmingBudget,
  generateFarmingExperiment
} from '../../src/lib/relic-score/farming/farming-contract.js';
import {
  rawSubUtility,
  selectCandidate,
  sortedSelectedValues,
  summarizeSelections,
  type CandidateLens,
  type CandidateSelection
} from '../../src/lib/relic-score/farming/prototype.js';
import { createSeededRng, PRNG_VERSION } from '../../src/lib/relic-score/farming/prng.js';
import { benchmarkIdentityDigest, loadFarmingInputs } from './farming-inputs.js';
import { loadProfileInputs, validateCurrentProfiles } from './validate.js';

const options = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const match = /^--([a-zA-Z]+)=(.+)$/.exec(arg);
    if (!match) throw new Error(`[relic-score/farming] invalid argument ${arg}`);
    return [match[1], match[2]];
  })
);
const allowedArgs = ['characterId', 'slot', 'N', 'experimentCount', 'seed', 'lens', 'quantiles'];
if (Object.keys(options).some((key) => !allowedArgs.includes(key)))
  throw new Error('[relic-score/farming] unknown argument');
function integer(name: string, max = Number.MAX_SAFE_INTEGER, min = 1): number {
  const raw = options[name];
  const value = Number(raw);
  if (!raw || !Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`[relic-score/farming] --${name} must be an integer from ${min} to ${max}`);
  return value;
}
const characterId = options.characterId;
const slot = options.slot as RelicSlot;
const lensArg = options.lens;
if (!characterId || !['HEAD', 'HAND', 'BODY', 'FOOT', 'NECK', 'OBJECT'].includes(slot))
  throw new Error('[relic-score/farming] --characterId and --slot are required');
if (!['A', 'B', 'C', 'all'].includes(lensArg))
  throw new Error('[relic-score/farming] --lens=A|B|C|all is required');
const N = integer('N');
const experimentCount = integer('experimentCount');
const seed = integer('seed', 0xffffffff, 0);
const quantilePoints: Array<257 | 513> = options.quantiles
  ? (options.quantiles === 'both' ? ['257', '513'] : options.quantiles.split(',')).map((value) => {
      if (value !== '257' && value !== '513')
        throw new Error('[relic-score/farming] --quantiles must be 257, 513 or both');
      return Number(value) as 257 | 513;
    })
  : [];
const lenses: CandidateLens[] = lensArg === 'all' ? ['A', 'B', 'C'] : [lensArg as CandidateLens];
const start = performance.now();
const startRss = process.memoryUsage().rss;
const [artifact, profileInputs, { model }] = await Promise.all([
  validateCurrentProfiles(),
  loadProfileInputs(),
  loadFarmingInputs()
]);
const profile = artifact.profiles.find((item) => item.characterId === characterId);
const character = profileInputs.characters.find((item) => item.id === characterId);
if (!profile || !character || profile.metadata.reviewStatus !== 'reviewed')
  throw new Error('[relic-score/farming] reviewed profile required');
const recommendation = character.equipmentRecommendation;
const recommendedMains = new Set<RelicStatKey>(
  slot === 'HEAD' || slot === 'HAND'
    ? [model.mainBySlot[slot][0].key]
    : ((recommendation.mainStatOptions.find((item) => item.slot === slot)?.propertyTypes as
        RelicStatKey[] | undefined) ?? [])
);
if (!recommendedMains.size) throw new Error('[relic-score/farming] missing main recommendation');
const budget = farmingBudget(N);
const rng = createSeededRng(seed);
const results: Record<CandidateLens, CandidateSelection[]> = { A: [], B: [], C: [] };
const simulationStart = performance.now();
for (let experiment = 0; experiment < experimentCount; experiment++) {
  const pieces = generateFarmingExperiment(slot, budget, model, rng);
  const utility = (piece: (typeof pieces)[number]): number => rawSubUtility(piece, profile, model);
  for (const lens of lenses)
    results[lens].push(selectCandidate(pieces, lens, recommendedMains, utility));
}
const simulationMs = performance.now() - simulationStart;
const summaries = Object.fromEntries(
  lenses.map((lens) => {
    const sorted = sortedSelectedValues(results[lens]);
    const quantiles = quantilePoints.map((points) => {
      if (!sorted.length) return { points, status: 'noEligibleCandidate' as const };
      const values = encodeDenseQuantiles(sorted, points);
      const json = JSON.stringify(values);
      return {
        points,
        rawBytes: Buffer.byteLength(json),
        gzipBytes: gzipSync(json).byteLength,
        projected582RawBytes: Buffer.byteLength(json) * 582,
        ...measureQuantileError(sorted, values)
      };
    });
    return [
      lens,
      {
        digest257: benchmarkIdentityDigest({
          characterId,
          slot,
          profile,
          recommendation,
          model,
          budget,
          experimentCount,
          seed,
          lens,
          quantilePoints: 257
        }),
        ...summarizeSelections(results[lens]),
        quantiles
      }
    ];
  })
);
console.log(
  JSON.stringify(
    {
      prototypeOnly: true,
      characterId,
      templateId: profile.templateId,
      targetMode: 'target-free base-weight',
      slot,
      N,
      experimentCount,
      seed,
      prngVersion: PRNG_VERSION,
      recommendedMains: [...recommendedMains],
      summaries,
      performance: {
        piecesGenerated: N * experimentCount,
        simulationMs,
        piecesPerSecond: (N * experimentCount * 1000) / simulationMs,
        runtimeMs: performance.now() - start,
        rssStartBytes: startRss,
        rssEndBytes: process.memoryUsage().rss
      }
    },
    null,
    2
  )
);
