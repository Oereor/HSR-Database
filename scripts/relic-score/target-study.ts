import { readFile, writeFile } from 'node:fs/promises';
import type { RelicSlot } from '../../src/lib/domain/types.js';
import { buildRelicScoreReferenceData } from '../../src/lib/relic-score/reference.js';
import { scoreBuild, type BuildTargetContext } from '../../src/lib/relic-score/score.js';
import type { PlayerBuildInput } from '../../src/lib/relic-score/types.js';
import { RELIC_SLOTS } from '../../src/lib/relic-score/scoring-config.js';
import { generateBenchmarkCases } from './benchmark-core.js';
import { loadScoringInputs } from './scoring-inputs.js';

const choices = [
  ['1002', 'CriticalChanceBase'],
  ['1415', 'CriticalChanceBase'],
  ['1413', 'CriticalChanceBase'],
  ['1505', 'CriticalChanceBase'],
  ['8009', 'CriticalChanceBase'],
  ['1301', 'BreakDamageAddedRatioBase'],
  ['1303', 'BreakDamageAddedRatioBase'],
  ['1222', 'BreakDamageAddedRatioBase'],
  ['8009', 'AttackAddedRatio'],
  ['1501', 'AttackAddedRatio'],
  ['1412', 'AttackAddedRatio'],
  ['1304', 'DefenceAddedRatio'],
  ['1409', 'StatusResistanceBase']
] as const;
const seed = 123456789,
  N = 3,
  K = 512;
const inputs = await loadScoringInputs();
const original = JSON.parse(
  await readFile('tests/fixtures/relic-score/player-builds/complete-five-star.json', 'utf8')
) as PlayerBuildInput;
const cases = [...new Set(choices.map(([id]) => id))].flatMap((characterId) =>
  RELIC_SLOTS.map((slot) => ({ characterId, slot }))
);
const generated = generateBenchmarkCases(inputs, { N, K, seed, cases, prototype: true });
const reference = buildRelicScoreReferenceData(inputs.runtime);
const rows = [];
for (const [characterId, stat] of choices) {
  const profile = inputs.profiles.find((item) => item.characterId === characterId)!;
  const target = profile.statTargets.find((item) => item.stat === stat)!;
  const baseline = target.value * 0.4;
  const epsilon = target.value * 1e-5;
  for (const [label, panelValue] of [
    ['below', target.value - epsilon],
    ['exact', target.value],
    ['above', target.value + epsilon],
    ['far-above', target.value * 2]
  ] as const) {
    const build = structuredClone(original);
    build.characterId = characterId;
    build.relics.forEach((piece) => {
      piece.substats = [];
    });
    const delta = panelValue - baseline;
    const ratio = stat === 'AttackAddedRatio' || stat === 'DefenceAddedRatio';
    build.relics[0].substats = [
      {
        key: stat,
        value: ratio ? delta / 1000 : delta,
        occurrenceCount: 1,
        cumulativeStep: 0,
        rollCount: { status: 'exact', count: 1, source: 'provider' }
      }
    ];
    build.panel[target.panelTarget] = panelValue;
    const context: BuildTargetContext = {
      targets: profile.statTargets.map((entry) =>
        entry.stat === stat
          ? {
              stat,
              panelTarget: target.panelTarget,
              baseline,
              contributions: [{ slot: 'HEAD' as RelicSlot, panelDelta: delta }]
            }
          : {
              stat: entry.stat,
              panelTarget: entry.panelTarget,
              baseline: build.panel[entry.panelTarget] ?? 0,
              contributions: []
            }
      )
    };
    const result = scoreBuild(
      build,
      {
        profile,
        recommendation: inputs.recommendations.find((item) => item.avatarId === characterId),
        reference,
        benchmark: generated.artifact,
        benchmarkExpected: generated.expected
      },
      context
    );
    if (result.status !== 'available' || !result.build)
      throw new Error(
        `[relic-score/target-study] ${characterId}:${stat}:${label}: ${result.reason}`
      );
    const explanation = result.build.targets.find((item) => item.stat === stat)!;
    rows.push({
      characterId,
      stat,
      target: target.value,
      postTargetWeight: target.postTargetWeight,
      label,
      panelValue,
      baseUtility: explanation.baseUtility,
      targetAwareUtility: explanation.targetAwareUtility,
      S_base: result.build.statCompletion.base,
      candidateA: result.build.statCompletion.targetA,
      candidateB: result.build.statCompletion.targetB,
      finalBase: result.build.finalBaseScore,
      finalA: result.build.finalTargetA,
      finalB: result.build.finalTargetB
    });
  }
}
const output = { prototype: true, seed, N, K, rows };
const path = process.argv.find((arg) => arg.startsWith('--out='))?.slice(6);
if (path) await writeFile(path, `${JSON.stringify(output, null, 2)}\n`);
else console.log(JSON.stringify(output, null, 2));
