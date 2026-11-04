import { mkdir, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { UpstreamPin } from '../deployment/lock.js';
import { readUpstreamLock } from '../deployment/lock.js';
import { siteRoot } from './paths.js';
import { parseGameVersion, canonicalJsonDigest } from './source-metadata.js';
import { parseRawJson } from './raw.js';
import {
  assertBaseline,
  extractHomepageIds,
  selectPreviousVersion,
  type HistoryCommit,
  type HomepageBaseline
} from './homepage.js';

export const identityTables = [
  'AvatarConfig',
  'AvatarConfigLD',
  'EquipmentConfig',
  'RelicSetConfig',
  'MonsterTemplateConfig'
] as const;
export interface HistoryReader {
  commit(sha: string): Promise<HistoryCommit>;
  table(sha: string, name: string): Promise<Array<Record<string, unknown>>>;
}
export function githubHistoryReader(pin: UpstreamPin): HistoryReader {
  const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\.git$/.exec(pin.repository);
  if (!match) throw new Error('Homepage history requires a GitHub repository');
  const repository = match[1];
  const request = async (url: string, authenticated = false) => {
    const response = await fetch(url, {
      headers:
        authenticated && process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {},
      signal: AbortSignal.timeout(60_000)
    });
    if (!response.ok) throw new Error(`Homepage history request failed: ${response.status} ${url}`);
    return response;
  };
  return {
    async commit(sha) {
      const value = await (
        await request(`https://api.github.com/repos/${repository}/commits/${sha}`, true)
      ).json();
      if (value.sha !== sha) throw new Error('Homepage API commit mismatch');
      return {
        sha,
        subject: value.commit.message.split('\n')[0],
        parent: value.parents[0]?.sha ?? null
      };
    },
    async table(sha, name) {
      const response = await request(
        `https://raw.githubusercontent.com/${repository}/${sha}/ExcelOutput/${name}.json`
      );
      const value = parseRawJson<
        Array<Record<string, unknown>> | Record<string, Record<string, unknown>>
      >(await response.text());
      return Array.isArray(value) ? value : Object.values(value);
    }
  };
}

/** Explicit offline bootstrap, never changes the supplied repository. */
export function localHistoryReader(root: string): HistoryReader {
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024
    });
  return {
    async commit(sha) {
      const [actual, subject, parents] = git('show', '-s', '--format=%H%n%s%n%P', sha)
        .trim()
        .split('\n');
      if (actual !== sha) throw new Error('Homepage local commit mismatch');
      return { sha, subject, parent: parents?.split(' ')[0] || null };
    },
    async table(sha, name) {
      const value = parseRawJson<
        Array<Record<string, unknown>> | Record<string, Record<string, unknown>>
      >(git('show', `${sha}:ExcelOutput/${name}.json`));
      return Array.isArray(value) ? value : Object.values(value);
    }
  };
}

export async function refreshHomepageBaseline(
  root: string,
  pin: UpstreamPin,
  reader = githubHistoryReader(pin)
): Promise<HomepageBaseline> {
  const directory = path.join(root, 'data/homepage');
  await mkdir(directory, { recursive: true });
  const cached: HomepageBaseline[] = [];
  for (const file of await readdir(directory)) {
    if (!/^[a-f0-9]{40}\.json$/.test(file)) continue;
    const value: HomepageBaseline = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
    assertBaseline(value);
    if (value.repository === pin.repository) cached.push(value);
  }
  const exact = cached.find((entry) => entry.evidence[0].sha === pin.commit);
  if (exact) return exact;
  const known = new Map(
    cached.flatMap((entry) => entry.evidence.map((commit) => [commit.sha, commit] as const))
  );
  const evidence: HistoryCommit[] = [];
  let sha: string | null = pin.commit;
  let version: string | null = null;
  while (sha && evidence.length < 2000) {
    const commit: HistoryCommit = known.get(sha) ?? (await reader.commit(sha));
    if (commit.sha !== sha || evidence.some((entry) => entry.sha === sha))
      throw new Error('Homepage invalid history chain');
    const parsed = parseGameVersion(commit.subject).gameVersion;
    if (!parsed) throw new Error(`Homepage cannot locate production version at ${sha}`);
    evidence.push(commit);
    version ??= parsed;
    if (parsed !== version) break;
    sha = commit.parent;
  }
  const selected = selectPreviousVersion(evidence);
  const previous = cached.find((entry) => entry.gameVersion === selected.gameVersion);
  if (previous && previous.baselineCommit !== selected.baselineCommit)
    throw new Error(
      'Homepage same-version baseline changed; upstream history requires investigation'
    );
  const reusable = cached.find((entry) => entry.baselineCommit === selected.baselineCommit);
  const ids =
    reusable?.ids ??
    extractHomepageIds(
      Object.fromEntries(
        await Promise.all(
          identityTables.map(async (name) => [
            name,
            await reader.table(selected.baselineCommit, name)
          ])
        )
      )
    );
  const contents = {
    schemaVersion: 1 as const,
    repository: pin.repository,
    ...selected,
    evidence,
    ids
  };
  const result = { ...contents, digest: canonicalJsonDigest(contents) };
  assertBaseline(result);
  const target = path.join(directory, `${pin.commit}.json`);
  await writeFile(`${target}.tmp`, `${JSON.stringify(result, null, 2)}\n`);
  await rename(`${target}.tmp`, target);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourceIndex = process.argv.indexOf('--source-root');
  const source = sourceIndex >= 0 ? process.argv[sourceIndex + 1] : undefined;
  if (sourceIndex >= 0 && !source) throw new Error('--source-root requires a path');
  const lock = await readUpstreamLock(siteRoot);
  const result = await refreshHomepageBaseline(
    siteRoot,
    lock.turnBasedGameData,
    source ? localHistoryReader(path.resolve(source)) : undefined
  );
  console.log(
    `[homepage] v${result.gameVersion} baseline v${result.baselineVersion} @ ${result.baselineCommit}`
  );
}
