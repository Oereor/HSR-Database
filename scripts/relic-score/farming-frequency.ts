import { generateNaturalRelic } from '../../src/lib/relic-score/farming/generate-natural-relic.js';
import { createSeededRng } from '../../src/lib/relic-score/farming/prng.js';
import { loadFarmingInputs } from './farming-inputs.js';

const sampleCount = 40_000;
const seed = 501;
const { model } = await loadFarmingInputs();
const rng = createSeededRng(seed);
const main = new Map<string, number>();
const firstSub = new Map<string, number>();
const secondGivenFirstHp = new Map<string, number>();
let fourInitial = 0;
let cumulativeSteps = 0;
let occurrences = 0;
for (let index = 0; index < sampleCount; index++) {
  const piece = generateNaturalRelic('BODY', model, rng);
  main.set(piece.mainStat.key, (main.get(piece.mainStat.key) ?? 0) + 1);
  firstSub.set(piece.substats[0].key, (firstSub.get(piece.substats[0].key) ?? 0) + 1);
  if (piece.substats[0].key === 'HPDelta')
    secondGivenFirstHp.set(
      piece.substats[1].key,
      (secondGivenFirstHp.get(piece.substats[1].key) ?? 0) + 1
    );
  if (piece.initialSubstatCount === 4) fourInitial++;
  for (const sub of piece.substats) {
    cumulativeSteps += sub.cumulativeStep;
    occurrences += sub.occurrenceCount;
  }
}
const rows = [
  ...model.mainBySlot.BODY.map(({ key, probability }) => ({
    distribution: `BODY main ${key}`,
    expected: probability,
    observed: (main.get(key) ?? 0) / sampleCount,
    sampleCount
  })),
  {
    distribution: 'four initial',
    expected: model.config.initialSubstatModel.fourProbability,
    observed: fourInitial / sampleCount,
    sampleCount
  },
  {
    distribution: 'grade mean / roll (StepNum=2)',
    expected: 1,
    observed: cumulativeSteps / occurrences,
    sampleCount: occurrences
  },
  {
    distribution: 'first HPDelta / first SpeedDelta ratio',
    expected: 10 / 4,
    observed: firstSub.get('HPDelta')! / firstSub.get('SpeedDelta')!,
    sampleCount
  },
  {
    distribution: 'second AttackDelta / SpeedDelta given first HPDelta',
    expected: 10 / 4,
    observed: secondGivenFirstHp.get('AttackDelta')! / secondGivenFirstHp.get('SpeedDelta')!,
    sampleCount: firstSub.get('HPDelta')!
  }
].map((row) => ({ ...row, delta: row.observed - row.expected }));
console.log(JSON.stringify({ seed, rows }, null, 2));
