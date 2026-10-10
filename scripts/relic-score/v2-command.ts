import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { assertDataRoot, generatedRoot, resolveDataRoot, siteRoot } from '../data/paths.js';
import { readPreparedSourceMetadata } from '../data/source-metadata.js';
import {
  buildRatingV2Profiles,
  loadRatingV2Tables,
  assertRatingV2Profiles
} from '../data/relic-rating-v2.js';
import { readDataManifest } from '../data/generated-artifacts.js';
import { readUpstreamLock } from '../deployment/lock.js';
import { stableBenchmarkSerialize } from '../../src/lib/relic-score/benchmark/identity.js';
import {
  assertRatingV2PublicationReady,
  ratingV2ExpectedBenchmark,
  validateRatingV2Benchmark,
  type RatingV2Benchmark
} from '../../src/lib/relic-score/v2/benchmark.js';
import type { RatingV2Profiles } from '../../src/lib/relic-score/v2/profile.js';
import { generateRatingV2Benchmark } from './v2-benchmark-core.js';
import { loadFarmingInputs } from './farming-inputs.js';
import { compareRatingV2Alpha } from './v2-alpha-comparison.js';
import { normalizeRatingV2Build } from '../../src/lib/relic-score/v2/normalize.js';
import { scoreRatingV2Build } from '../../src/lib/relic-score/v2/score.js';
import { presentRatingV2 } from '../../src/lib/relic-score/v2/presentation.js';
import { buildRelicScoreReferenceData } from '../../src/lib/relic-score/reference.js';
import type { CanonicalPlayerCharacterBuild } from '../../src/lib/player/canonical.js';

const candidateRoot = path.join(siteRoot, 'data/relic-score/v2');
const reviewPath = path.join(
  siteRoot,
  'docs/relic-score-feature/relic-rating-v2-profile-review.json'
);
const benchmarkPath = path.join(candidateRoot, 'farming-benchmarks.json');
const command = process.argv[2];
const commands = [
  'profiles-generate',
  'review',
  'validate',
  'benchmarks-generate',
  'benchmarks-validate',
  'alpha-compare',
  'inspect',
  'score'
];
async function writeAtomic(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  const bytes = `${JSON.stringify(JSON.parse(stableBenchmarkSerialize(value)), null, 2)}\n`;
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
  if ((await readFile(file, 'utf8')) !== bytes)
    throw new Error('Candidate write verification failed');
}
async function loadPublishedProfiles(lockCommit: string): Promise<RatingV2Profiles> {
  const manifest = await readDataManifest();
  if (manifest.sourceCommit !== lockCommit)
    throw new Error('Generated manifest is not pinned; run data:sync against prepared source');
  const profiles: unknown = JSON.parse(
    await readFile(path.join(generatedRoot, 'runtime/relic-rating-v2.json'), 'utf8')
  );
  assertRatingV2Profiles(profiles, manifest.routes.characters, lockCommit);
  return profiles;
}
async function main() {
  const option = process.argv[3];
  if (
    !commands.includes(command) ||
    (['score', 'inspect'].includes(command)
      ? process.argv.length !== 4 ||
        !option.startsWith(command === 'score' ? '--input=' : '--character=')
      : process.argv.length !== 3)
  )
    throw new Error(
      `Usage: v2-command.ts ${commands.join('|')}; score --input=CANONICAL_BUILD.json; inspect --character=ID; no approve-current or skip-gate option`
    );
  const lock = await readUpstreamLock(siteRoot);
  const commit = lock.turnBasedGameData.commit;
  const root = assertDataRoot(resolveDataRoot());
  const metadata = readPreparedSourceMetadata(root);
  if (metadata.sourceCommit !== commit)
    throw new Error('Rating V2 input is not the formal upstream pin');
  const derived = await buildRatingV2Profiles(root, await loadRatingV2Tables(root), commit);
  const blockers = derived.profiles.filter((profile) => profile.status !== 'ready');
  if (command === 'inspect') {
    const profile = derived.profiles.find(
      (profile) => profile.characterId === option.slice('--character='.length)
    );
    if (!profile) throw new Error('Unknown character');
    console.log(JSON.stringify(profile, null, 2));
    return;
  }
  if (['profiles-generate', 'review', 'validate'].includes(command)) {
    let previous: RatingV2Profiles | undefined;
    try {
      previous = JSON.parse(
        await readFile(path.join(candidateRoot, 'character-profiles.json'), 'utf8')
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const previousById = new Map(
      previous?.profiles.map((profile) => [profile.characterId, profile]) ?? []
    );
    const changed = derived.profiles
      .filter(
        (profile) =>
          stableBenchmarkSerialize(profile) !==
          stableBenchmarkSerialize(previousById.get(profile.characterId))
      )
      .map((profile) => profile.characterId);
    const legacy = JSON.parse(
      await readFile(
        path.join(siteRoot, 'src/lib/relic-score/generated/character-profiles.json'),
        'utf8'
      )
    ) as { profiles: Array<{ characterId: string; substatWeights: Record<string, number> }> };
    const legacyById = new Map(legacy.profiles.map((profile) => [profile.characterId, profile]));
    const legacyChanges = derived.profiles
      .map((profile) => ({
        characterId: profile.characterId,
        weights: Object.entries(profile.effectiveSubWeights)
          .filter(
            ([key, value]) =>
              Math.abs((legacyById.get(profile.characterId)?.substatWeights[key] ?? 0) - value) >
              1e-12
          )
          .map(([key, value]) => ({
            key,
            previous: legacyById.get(profile.characterId)?.substatWeights[key] ?? 0,
            current: value
          }))
      }))
      .filter((profile) => profile.weights.length);
    const review = {
      sourceCommit: commit,
      sourceDigests: derived.sourceDigests,
      semanticDigest: derived.semanticDigest,
      status: blockers.length ? 'blocked' : 'ready',
      totalCharacters: derived.profiles.length,
      readyCharacters: derived.profiles
        .filter((profile) => profile.status === 'ready')
        .map((profile) => profile.characterId),
      blockedCharacters: blockers.map((profile) => profile.characterId),
      changes: {
        addedOrChanged: changed,
        removed:
          previous?.profiles
            .filter(
              (profile) =>
                !derived.profiles.some((item) => item.characterId === profile.characterId)
            )
            .map((profile) => profile.characterId) ?? []
      },
      legacyComparison: {
        changedCharacters: legacyChanges.length,
        changedSubWeights: legacyChanges.reduce((sum, profile) => sum + profile.weights.length, 0),
        characters: legacyChanges
      },
      anomalies: derived.profiles.flatMap((profile) => profile.anomalies)
    };
    if (command === 'profiles-generate')
      await writeAtomic(path.join(candidateRoot, 'character-profiles.json'), derived);
    if (command !== 'validate') await writeAtomic(reviewPath, review);
    if (command === 'validate') {
      const published = await loadPublishedProfiles(commit);
      if (stableBenchmarkSerialize(published) !== stableBenchmarkSerialize(derived))
        throw new Error('Published Rating V2 profiles differ from pinned raw sources');
    }
    console.log(
      `[rating-v2] structural/semantic validation passed; ${derived.profiles.length} characters; ${blockers.length} review blocker(s); publication ${blockers.length ? 'blocked' : 'ready'}`
    );
    return;
  }
  const profiles = await loadPublishedProfiles(commit);
  if (command === 'score') {
    const { runtime, model } = await loadFarmingInputs();
    const build = JSON.parse(
      await readFile(path.resolve(siteRoot, option.slice('--input='.length)), 'utf8')
    ) as CanonicalPlayerCharacterBuild;
    const normalized = normalizeRatingV2Build(build, runtime);
    let benchmark: RatingV2Benchmark | undefined;
    try {
      benchmark = JSON.parse(await readFile(benchmarkPath, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const result = scoreRatingV2Build(
      normalized.status === 'valid' ? normalized.input : normalized.partialInput,
      {
        profile: profiles.profiles.find((profile) => profile.characterId === build.avatarId),
        reference: buildRelicScoreReferenceData(runtime),
        benchmark,
        expected: ratingV2ExpectedBenchmark(model, profiles.profiles),
        sourceCommit: commit
      }
    );
    console.log(JSON.stringify(presentRatingV2(normalized, result), null, 2));
    return;
  }
  assertRatingV2PublicationReady(profiles, commit);
  const { runtime, model } = await loadFarmingInputs();
  const expected = ratingV2ExpectedBenchmark(model, profiles.profiles);
  if (command === 'benchmarks-generate') {
    const started = performance.now();
    const result = generateRatingV2Benchmark(model, profiles);
    const artifactBytes = Buffer.from(
      `${JSON.stringify(JSON.parse(stableBenchmarkSerialize(result.artifact)), null, 2)}\n`
    );
    const audit = {
      status: 'candidate-gated',
      sourceCommit: commit,
      semanticDigest: profiles.semanticDigest,
      samplingDigest: expected.samplingDigest,
      subProfileDigests: expected.profileDigests,
      artifactSha256: createHash('sha256').update(artifactBytes).digest('hex'),
      artifactBytes: artifactBytes.length,
      generationSeconds: (performance.now() - started) / 1000,
      distributionCount: result.audit.length,
      representation: {
        passCount: result.audit.length,
        failCount: 0,
        maxError: Math.max(...result.audit.map((row) => row.maxAbsoluteCdfError))
      },
      distributions: result.audit
    };
    await writeAtomic(benchmarkPath, result.artifact);
    await writeAtomic(path.join(candidateRoot, 'benchmark-generation-audit.json'), audit);
    console.log(
      `[rating-v2] candidate generated/gated; ${result.audit.length} distributions; production remains V1 pending atomic cutover`
    );
    return;
  }
  const benchmark = JSON.parse(await readFile(benchmarkPath, 'utf8')) as RatingV2Benchmark;
  validateRatingV2Benchmark(benchmark, expected, commit, true);
  const audit = JSON.parse(
    await readFile(path.join(candidateRoot, 'benchmark-generation-audit.json'), 'utf8')
  ) as {
    status: string;
    sourceCommit: string;
    semanticDigest: string;
    samplingDigest: string;
    subProfileDigests: Record<string, string>;
    artifactSha256: string;
    artifactBytes: number;
    distributionCount: number;
    representation: { passCount: number; failCount: number; maxError: number };
  };
  const bytes = await readFile(benchmarkPath);
  if (
    audit.status !== 'candidate-gated' ||
    audit.sourceCommit !== benchmark.sourceCommit ||
    audit.samplingDigest !== expected.samplingDigest ||
    stableBenchmarkSerialize(audit.subProfileDigests) !==
      stableBenchmarkSerialize(expected.profileDigests) ||
    audit.artifactSha256 !== createHash('sha256').update(bytes).digest('hex') ||
    audit.artifactBytes !== bytes.length ||
    audit.distributionCount !== expected.cases.length ||
    audit.representation.passCount !== expected.cases.length ||
    audit.representation.failCount !== 0 ||
    !Number.isFinite(audit.representation.maxError) ||
    audit.representation.maxError > 0.005
  )
    throw new Error('Rating V2 generation audit mismatch');
  if (command === 'alpha-compare') {
    const comparison = compareRatingV2Alpha(profiles, benchmark, runtime, model);
    await writeAtomic(path.join(candidateRoot, 'alpha-comparison.json'), comparison);
    const report = `# 遗器评分 V2 α 比较\n\n本报告由同一份 Benchmark 和固定合法合成样本生成。正式 α 保持 0.35。\n\n来源：${commit}。普通六槽有效 Main/Sub 为 28/72；agnostic 进一步降低主份额。\n\n复现：\`pnpm relic-score:v2:alpha-compare\`。详细样本、均值、分位数和排名翻转见 \`data/relic-score/v2/alpha-comparison.json\`。\n\n${comparison.rows.map((row) => `- α=${row.alpha}: piece mean=${row.piece.mean.toFixed(3)}, build mean=${row.build.mean.toFixed(3)}, rank flips=${row.rankFlipsFrom035}`).join('\n')}\n`;
    await writeFile(
      path.join(siteRoot, 'docs/relic-score-feature/relic-rating-v2-alpha-comparison.md'),
      report
    );
  }
  console.log(`[rating-v2] ${command} passed`);
}
try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await writeAtomic(path.join(candidateRoot, 'last-run.json'), {
    command,
    status: 'failed-or-blocked',
    reason: message
  });
  console.error(`[rating-v2] ${message}`);
  process.exitCode = 1;
}
