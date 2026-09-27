import { readFile } from 'node:fs/promises';

export type ManifestReadFailure =
  'manifest-missing' | 'manifest-read-failed' | 'manifest-parse-failed';

// Report the stage from the original operation; preserve its exception for callers.
export async function readCacheJson(
  file: string,
  onFailure?: (reason: ManifestReadFailure) => void
): Promise<unknown> {
  let content: string;
  try {
    content = await readFile(file, 'utf8');
  } catch (error) {
    onFailure?.(
      (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? 'manifest-missing'
        : 'manifest-read-failed'
    );
    throw error;
  }
  try {
    return JSON.parse(content);
  } catch (error) {
    onFailure?.('manifest-parse-failed');
    throw error;
  }
}
