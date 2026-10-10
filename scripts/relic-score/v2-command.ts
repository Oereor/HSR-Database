import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { assertDataRoot, generatedRoot, resolveDataRoot, siteRoot } from '../data/paths.js';
import { readPreparedSourceMetadata } from '../data/source-metadata.js';
import {
  buildRatingV2Profiles,
  loadRatingV2Tables,
  assertRatingV2Profiles,
  readRatingV2PolicyInput
} from '../data/relic-rating-v2.js';
import { readDataManifest } from '../data/generated-artifacts.js';
import { readUpstreamLock } from '../deployment/lock.js';
import {
  stableBenchmarkSerialize,
  benchmarkSha256
} from '../../src/lib/relic-score/benchmark/identity.js';
import {
  assertRatingV2PublicationReady,
  ratingV2ExpectedBenchmark,
  validateRatingV2Benchmark,
  type RatingV2Benchmark
} from '../../src/lib/relic-score/v2/benchmark.js';
import type { RatingV2Profiles } from '../../src/lib/relic-score/v2/profile.js';
import {
  generateRatingV2Benchmark,
  generateRatingV2Distribution,
  RatingV2RepresentationError
} from './v2-benchmark-core.js';
import { assertRatingV2GenerationAudit } from '../../src/lib/relic-score/v2/audit.js';
import { execFileSync } from 'node:child_process';
import { loadFarmingInputs } from './farming-inputs.js';
import { compareRatingV2Alpha } from './v2-alpha-comparison.js';
import { normalizeRatingV2Build } from '../../src/lib/relic-score/v2/normalize.js';
import { scoreRatingV2Build } from '../../src/lib/relic-score/v2/score.js';
import { presentRatingV2 } from '../../src/lib/relic-score/v2/presentation.js';
import { buildRelicScoreReferenceData } from '../../src/lib/relic-score/reference.js';
import type { CanonicalPlayerCharacterBuild } from '../../src/lib/player/canonical.js';
import { assertRatingV2Overrides } from '../../src/lib/relic-score/v2/overrides.js';

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
  'benchmarks-determinism',
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
  const policy = (await readRatingV2PolicyInput()).value;
  assertRatingV2Overrides(policy, manifest.routes.characters, lockCommit);
  assertRatingV2Profiles(profiles, manifest.routes.characters, lockCommit, policy);
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
      historicalComparison: 'relic-rating-v2-v1-weight-comparison.historical.json',
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
      overrideDigest: profiles.overrideDigest,
      generatorProvenance: {
        commit: execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: siteRoot,
          encoding: 'utf8',
          windowsHide: true
        }).trim(),
        workingDiffSha256: createHash('sha256')
          .update(
            execFileSync('git', ['diff', '--', 'scripts/relic-score', 'src/lib/relic-score'], {
              cwd: siteRoot,
              windowsHide: true
            })
          )
          .digest('hex')
      },
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
    const stagingRoot = path.join(candidateRoot, '.staging');
    await writeAtomic(path.join(stagingRoot, 'farming-benchmarks.json'), result.artifact);
    await writeAtomic(path.join(stagingRoot, 'benchmark-generation-audit.json'), audit);
    const stagedBytes = await readFile(path.join(stagingRoot, 'farming-benchmarks.json'));
    validateRatingV2Benchmark(JSON.parse(stagedBytes.toString('utf8')), expected, commit, true);
    if (createHash('sha256').update(stagedBytes).digest('hex') !== audit.artifactSha256)
      throw new Error('Staged Rating V2 bytes mismatch');
    assertRatingV2GenerationAudit(audit, result.artifact, expected, {
      bytes: stagedBytes.length,
      sha256: audit.artifactSha256
    });
    const targets = ['farming-benchmarks.json', 'benchmark-generation-audit.json'];
    const previous = await Promise.all(
      targets.map(async (name) => {
        try {
          return await readFile(path.join(candidateRoot, name));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
          throw error;
        }
      })
    );
    try {
      for (const name of targets)
        await rename(path.join(stagingRoot, name), path.join(candidateRoot, name));
    } catch (error) {
      for (const [index, name] of targets.entries()) {
        const old = previous[index];
        if (old) {
          const recovery = path.join(stagingRoot, `${name}.recovery`);
          await writeFile(recovery, old);
          await rename(recovery, path.join(candidateRoot, name));
        } else await unlink(path.join(candidateRoot, name)).catch(() => {});
      }
      throw error;
    }
    if (!(await readFile(benchmarkPath)).equals(stagedBytes))
      throw new Error('Published Rating V2 bytes mismatch');
    console.log(
      `[rating-v2] formal artifacts generated/gated; ${result.audit.length} distributions; run data:ensure to refresh manifest binding`
    );
    return;
  }
  const benchmark = JSON.parse(await readFile(benchmarkPath, 'utf8')) as RatingV2Benchmark;
  validateRatingV2Benchmark(benchmark, expected, commit, true);
  const audit = JSON.parse(
    await readFile(path.join(candidateRoot, 'benchmark-generation-audit.json'), 'utf8')
  ) as unknown;
  const bytes = await readFile(benchmarkPath);
  const artifactSha256 = createHash('sha256').update(bytes).digest('hex');
  assertRatingV2GenerationAudit(audit, benchmark, expected, {
    bytes: bytes.length,
    sha256: artifactSha256
  });
  if (command === 'benchmarks-determinism') {
    const cases = [
      ['1001', 'HEAD', 'HPDelta'],
      ['1505', 'NECK', 'PhysicalAddedRatio'],
      ['1506', 'OBJECT', 'SPRatioBase']
    ];
    const checks = cases.map(([id, slot, key]) => {
      const item = expected.cases.find(
        (entry) => entry.characterId === id && entry.slot === slot && entry.mainStatKey === key
      );
      if (!item) throw new Error('Missing deterministic representative');
      const regenerated = generateRatingV2Distribution(
        model,
        profiles.profiles.find((profile) => profile.characterId === id)!,
        item
      );
      const original = benchmark.distributions[id]?.[item.slot]?.[item.mainStatKey];
      if (stableBenchmarkSerialize(regenerated.distribution) !== stableBenchmarkSerialize(original))
        throw new Error(`Rating V2 deterministic mismatch ${id}:${slot}:${key}`);
      return {
        ...item,
        distributionDigest: benchmarkSha256(regenerated.distribution),
        maxError: regenerated.error.maxAbsoluteCdfError
      };
    });
    await writeAtomic(path.join(candidateRoot, 'benchmark-determinism.json'), {
      artifactSha256,
      experimentCount: 65536,
      checks,
      status: 'passed'
    });
  }
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
  await writeAtomic(path.join(candidateRoot, 'last-run.json'), { command, status: 'passed' });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await writeAtomic(path.join(candidateRoot, 'last-run.json'), {
    command,
    status: 'failed-or-blocked',
    reason: message,
    ...(error instanceof RatingV2RepresentationError ? { diagnostic: error.diagnostic } : {})
  });
  console.error(`[rating-v2] ${message}`);
  process.exitCode = 1;
}
