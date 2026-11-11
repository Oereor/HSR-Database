import { assertDataRoot, resolveDataRoot, sourceCommit } from '../data/paths.js';
import { prepareTurnBasedGameData } from './prepare.js';
import type { UpstreamLock } from './lock.js';

export interface FormalDataSource {
  root: string;
  commit: string;
}

/** Formal consumers must never implicitly read the sibling development checkout. */
export async function resolveFormalDataSource(
  lock: UpstreamLock,
  env: NodeJS.ProcessEnv = process.env
): Promise<FormalDataSource> {
  const configured = env.HSR_DATA_ROOT?.trim();
  let root = resolveDataRoot(configured || '.upstream/TurnBasedGameData');
  let actualCommit = 'unavailable';
  try {
    if (!configured) root = (await prepareTurnBasedGameData(lock)).directory;
    assertDataRoot(root);
    actualCommit = sourceCommit(root);
    if (actualCommit !== lock.turnBasedGameData.commit)
      throw new Error('TurnBasedGameData commit does not match upstream.lock.json');
    return { root, commit: actualCommit };
  } catch (error) {
    throw new Error(
      `[formal-data] root=${root}; actual=${actualCommit}; expected=${lock.turnBasedGameData.commit}. ${error instanceof Error ? error.message : String(error)}. Clear HSR_DATA_ROOT to prepare the locked .upstream source, or point it to a checkout of the expected commit; then run pnpm run prebuild.`,
      { cause: error }
    );
  }
}
