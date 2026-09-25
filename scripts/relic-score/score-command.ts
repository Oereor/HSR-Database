import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { BenchmarkArtifact } from '../../src/lib/relic-score/benchmark/types.js';
import { validateBenchmarkArtifact } from '../../src/lib/relic-score/benchmark/validate.js';
import { buildRelicScoreReferenceData } from '../../src/lib/relic-score/reference.js';
import { scoreBuild } from '../../src/lib/relic-score/score.js';
import type { PlayerBuildInput } from '../../src/lib/relic-score/types.js';
import { expectedBenchmarkIdentity } from './benchmark-core.js';
import { loadScoringInputs } from './scoring-inputs.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const match = /^--([a-zA-Z]+)=(.+)$/.exec(arg);
    if (!match) throw new Error(`[relic-score/score] invalid argument ${arg}`);
    return [match[1], match[2]];
  })
);
if (!args.fixture || !args.benchmark)
  throw new Error('[relic-score/score] --fixture and --benchmark required');
const read = async (name: string) =>
  JSON.parse(await readFile(path.resolve(name), 'utf8')) as unknown;
const [inputs, fixture, benchmark] = await Promise.all([
  loadScoringInputs(),
  read(args.fixture),
  read(args.benchmark)
]);
const payload =
  'build' in (fixture as object)
    ? (fixture as { build: PlayerBuildInput })
    : { build: fixture as PlayerBuildInput };
if (!payload.build || !Array.isArray(payload.build.relics))
  throw new Error('[relic-score/score] fixture requires build');
const artifact = benchmark as BenchmarkArtifact;
const cases = Object.entries(artifact.distributions).flatMap(([characterId, slots]) =>
  Object.keys(slots).map((slot) => ({
    characterId,
    slot: slot as PlayerBuildInput['relics'][number]['slot']
  }))
);
const expected = expectedBenchmarkIdentity(inputs, {
  N: artifact.metadata.budgetN,
  K: artifact.metadata.experimentCount,
  seed: artifact.metadata.seed,
  cases,
  prototype: true
});
validateBenchmarkArtifact(artifact, expected);
const result = scoreBuild(payload.build, {
  profile: inputs.profiles.find((profile) => profile.characterId === payload.build.characterId),
  recommendation: inputs.recommendations.find(
    (item) => item.avatarId === payload.build.characterId
  ),
  reference: buildRelicScoreReferenceData(inputs.runtime),
  benchmark: artifact,
  benchmarkExpected: expected,
  benchmarkValidated: true
});
if (args.inspect === 'true')
  console.log(JSON.stringify({ result, benchmarkMetadata: artifact.metadata }, null, 2));
else
  console.log(
    JSON.stringify(
      {
        status: result.status,
        reason: result.reason,
        pieces: result.pieces.map((piece) =>
          piece.status === 'available'
            ? {
                slot: piece.value.slot,
                pieceScore: piece.value.pieceScore,
                effectiveHits: piece.value.effectiveHits
              }
            : piece
        ),
        statCompletion: result.build?.statCompletion,
        softTargetProgress: result.build?.softTargetProgress,
        hardBreakpointFailureRatio: result.build?.hardBreakpointFailureRatio,
        T: result.build?.setIntegrity.total,
        coreBuildScore: result.build?.coreBuildScore,
        finalBuildScore: result.build?.finalBuildScore,
        effectiveHits: result.build?.effectiveHits
      },
      null,
      2
    )
  );
