import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { TextMap } from './localization.js';

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/gu;

export interface EnglishCjkHit {
  artifact: string;
  jsonPath: string;
  text: string;
  segments: string[];
  provenance: 'TextMapEN' | 'site-message' | 'unexplained';
}

export interface EnglishCjkReport {
  hits: number;
  textMapEnHits: number;
  siteMessageHits: number;
  unexplainedHits: number;
  entries: EnglishCjkHit[];
}

async function artifactFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(root, entry.name);
      return entry.isDirectory() ? artifactFiles(target) : Promise.resolve([target]);
    })
  );
  return nested.flat().sort((left, right) => left.localeCompare(right, 'en'));
}

function collectStrings(value: unknown, jsonPath = '$'): Array<{ jsonPath: string; text: string }> {
  if (typeof value === 'string') return [{ jsonPath, text: value }];
  if (Array.isArray(value))
    return value.flatMap((item, index) => collectStrings(item, `${jsonPath}[${index}]`));
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([key, child]) =>
      collectStrings(child, `${jsonPath}.${key}`)
    );
  return [];
}

/** Scan staged English artifacts and classify any Han text by its owning source. */
export async function auditEnglishCjk(input: {
  generatedViewRoot: string;
  staticLocaleRoot: string;
  siteMessages: Record<string, string>;
  textMap: TextMap;
}): Promise<EnglishCjkReport> {
  const textMapSegments = new Set(
    Object.values(input.textMap).flatMap((value) =>
      [...value.matchAll(CJK)].map(([match]) => match)
    )
  );
  const files = (
    await Promise.all([input.generatedViewRoot, input.staticLocaleRoot].map(artifactFiles))
  ).flat();
  const sources: Array<{ artifact: string; value: unknown; siteMessage: boolean }> = [
    ...(await Promise.all(
      files.map(async (file) => ({
        artifact: path.relative(process.cwd(), file).replaceAll('\\', '/'),
        value: JSON.parse(await readFile(file, 'utf8')) as unknown,
        siteMessage: false
      }))
    )),
    { artifact: 'messages/en.json', value: input.siteMessages, siteMessage: true }
  ];
  const entries: EnglishCjkHit[] = [];
  for (const source of sources)
    for (const item of collectStrings(source.value)) {
      const segments = [...item.text.matchAll(CJK)].map(([match]) => match);
      if (!segments.length) continue;
      const provenance = source.siteMessage
        ? 'site-message'
        : segments.every((segment) => textMapSegments.has(segment))
          ? 'TextMapEN'
          : 'unexplained';
      entries.push({ ...item, artifact: source.artifact, segments, provenance });
    }
  return {
    hits: entries.length,
    textMapEnHits: entries.filter(({ provenance }) => provenance === 'TextMapEN').length,
    siteMessageHits: entries.filter(({ provenance }) => provenance === 'site-message').length,
    unexplainedHits: entries.filter(({ provenance }) => provenance === 'unexplained').length,
    entries
  };
}

export function assertEnglishCjkReport(report: EnglishCjkReport): void {
  if (!report.siteMessageHits && !report.unexplainedHits) return;
  const sample = report.entries
    .filter(({ provenance }) => provenance !== 'TextMapEN')
    .slice(0, 10)
    .map(
      ({ artifact, jsonPath, segments, provenance }) =>
        `${artifact}${jsonPath}: ${segments.join(', ')} (${provenance})`
    )
    .join('\n');
  throw new Error(`English artifacts contain unexplained CJK text:\n${sample}`);
}
