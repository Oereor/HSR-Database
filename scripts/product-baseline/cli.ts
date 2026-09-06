import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { auditRoot, siteRoot } from '../data/paths.js';
import { captureProductBaseline } from './capture.js';
import { compareProductBaseline } from './compare.js';
import { readProductBaselineFixtures, writeProductBaselineFixtures } from './fixtures.js';
import type { ProductBaselineDifference } from './model.js';

const diagnosticRoot = path.join(auditRoot, 'product-baseline');

function runFreshGeneration(): void {
  const pnpmScript = process.env.npm_execpath;
  const command = pnpmScript ? process.execPath : 'pnpm';
  const args = (script: string) => (pnpmScript ? [pnpmScript, script] : [script]);
  execFileSync(command, args('data:sync'), {
    cwd: siteRoot,
    stdio: 'inherit',
    windowsHide: true
  });
  execFileSync(command, args('assets:ensure'), {
    cwd: siteRoot,
    stdio: 'inherit',
    windowsHide: true
  });
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function writeDiagnostics(differences: ProductBaselineDifference[]): Promise<void> {
  await mkdir(diagnosticRoot, { recursive: true });
  await writeFile(
    path.join(diagnosticRoot, 'diff.json'),
    `${JSON.stringify(differences, null, 2)}\n`,
    'utf8'
  );
}

function assertR0Capture(capture: Awaited<ReturnType<typeof captureProductBaseline>>): void {
  if (capture.characters.order.length !== 97)
    throw new Error(`Expected 97 Characters, received ${capture.characters.order.length}`);
  const localization = capture.unresolvedLocalization as {
    classificationComplete?: boolean;
    invalidProgramErrors?: Record<string, number>;
  };
  if (!localization.classificationComplete)
    throw new Error('Unresolved localization baseline contains unclassified references');
  const programErrors = Object.entries(localization.invalidProgramErrors ?? {}).filter(
    ([, count]) => count !== 0
  );
  if (programErrors.length)
    throw new Error(`Localization program errors remain: ${JSON.stringify(programErrors)}`);
  const icons = capture.characterIcons as { missingKeys?: string[] };
  if (icons.missingKeys?.length)
    throw new Error(`Character detail icons are missing: ${icons.missingKeys.join(', ')}`);
}

async function check(): Promise<void> {
  runFreshGeneration();
  const [expected, actual] = await Promise.all([
    readProductBaselineFixtures(),
    captureProductBaseline()
  ]);
  assertR0Capture(actual);
  const differences = compareProductBaseline(expected, actual);
  await writeDiagnostics(differences);
  if (differences.length) {
    console.error(`Product baseline differs in ${differences.length} fields. First 25:`);
    for (const difference of differences.slice(0, 25))
      console.error(
        `${difference.domain}/${difference.entityId} ${difference.path}: ${JSON.stringify(difference.expected)} -> ${JSON.stringify(difference.actual)}`
      );
    throw new Error(
      `zh-CN product baseline check failed; full diff: ${path.relative(siteRoot, path.join(diagnosticRoot, 'diff.json'))}`
    );
  }
  console.log(
    `zh-CN product baseline verified: ${actual.characters.order.length} Characters and seven product areas; 0 semantic differences.`
  );
}

async function update(): Promise<void> {
  const reason = argument('--reason')?.trim();
  if (!reason) throw new Error('Use --reason "<maintainer-approved reason>" to update fixtures');
  runFreshGeneration();
  const capture = await captureProductBaseline();
  assertR0Capture(capture);
  await writeProductBaselineFixtures(capture, reason);
  await writeDiagnostics([]);
  console.log(
    `zh-CN product baseline updated: ${capture.characters.order.length} Characters; reason: ${reason}`
  );
}

const command = process.argv[2];
if (command === 'check') await check();
else if (command === 'update') await update();
else throw new Error(`Unknown product baseline command: ${command ?? '<missing>'}`);
