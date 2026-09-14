import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { auditRoot, siteRoot } from '../data/paths.js';
import { PRODUCT_BASELINE_CASES } from './cases.js';
import { compareProductBaseline } from './compare.js';
import {
  readProductBaselineFixtures,
  writeProductBaselineFixtures,
  writeSearchProductBaselineFixture
} from './fixtures.js';
import type { ProductBaselineCapture, ProductBaselineDifference } from './model.js';

const diagnosticRoot = path.join(auditRoot, 'product-baseline');

export const PRODUCT_BASELINE_PREPARATION_STAGES = [
  'messages:check',
  'data:sync',
  'assets:ensure:enemies',
  'assets:ensure'
] as const;

export type ProductBaselinePreparationStage = (typeof PRODUCT_BASELINE_PREPARATION_STAGES)[number];
export type ProductBaselineCommandRunner = (stage: ProductBaselinePreparationStage) => void;

const runPnpmScript: ProductBaselineCommandRunner = (script) => {
  const pnpmScript = process.env.npm_execpath;
  const command = pnpmScript ? process.execPath : 'pnpm';
  const args = pnpmScript ? [pnpmScript, script] : [script];
  execFileSync(command, args, {
    cwd: siteRoot,
    stdio: 'inherit',
    windowsHide: true
  });
};

export function runFreshProductBaselinePreparation(
  runner: ProductBaselineCommandRunner = runPnpmScript
): void {
  for (const stage of PRODUCT_BASELINE_PREPARATION_STAGES) runner(stage);
}

export interface FreshProductBaselineDependencies {
  commandRunner?: ProductBaselineCommandRunner;
  capture?: () => Promise<ProductBaselineCapture>;
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

export function requireProductBaselineApprovalReason(reason: string | undefined): string {
  const normalized = reason?.trim();
  if (!normalized)
    throw new Error('Use --reason "<maintainer-approved reason>" to update fixtures');
  return normalized;
}

export function assertSearchOnlyDifferences(
  differences: readonly ProductBaselineDifference[]
): void {
  const forbidden = differences.filter(({ domain }) => domain !== 'search');
  if (!forbidden.length) return;
  throw new Error(
    `Search-only baseline update requires zero non-Search product differences; received ${forbidden.length}`
  );
}

export async function captureFreshProductBaseline(
  dependencies: FreshProductBaselineDependencies = {}
): Promise<ProductBaselineCapture> {
  runFreshProductBaselinePreparation(dependencies.commandRunner);
  const capture =
    dependencies.capture ??
    (async () => {
      const { captureProductBaseline } = await import('./capture.js');
      return captureProductBaseline();
    });
  const result = await capture();
  return result;
}

async function check(): Promise<void> {
  const [expected, actual] = await Promise.all([
    readProductBaselineFixtures(),
    captureFreshProductBaseline()
  ]);
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
    `zh-CN compact product baseline verified: ${Object.keys(actual.characters).length} Character cases and ${PRODUCT_BASELINE_CASES.endgame.length} Endgame cases; 0 semantic differences.`
  );
}

async function update(): Promise<void> {
  const reason = requireProductBaselineApprovalReason(argument('--reason'));
  const capture = await captureFreshProductBaseline();
  await writeProductBaselineFixtures(capture, reason);
  await writeDiagnostics([]);
  console.log(
    `zh-CN compact product baseline updated: ${Object.keys(capture.characters).length} Character cases; reason: ${reason}`
  );
}

async function updateSearch(): Promise<void> {
  const reason = requireProductBaselineApprovalReason(argument('--reason'));
  const [expected, actual] = await Promise.all([
    readProductBaselineFixtures(),
    captureFreshProductBaseline()
  ]);
  const differences = compareProductBaseline(expected, actual);
  await writeDiagnostics(differences);
  const forbidden = differences.filter(({ domain }) => domain !== 'search');
  if (forbidden.length) {
    console.error(
      `Search-only baseline update refused: ${forbidden.length} non-Search differences.`
    );
    for (const difference of forbidden.slice(0, 25))
      console.error(
        `${difference.domain}/${difference.entityId} ${difference.path}: ${JSON.stringify(difference.expected)} -> ${JSON.stringify(difference.actual)}`
      );
    assertSearchOnlyDifferences(differences);
  }
  await writeSearchProductBaselineFixture(actual, reason);
  await writeDiagnostics([]);
  console.log(
    `zh-CN Search baseline updated: ${differences.length} authorized field differences; reason: ${reason}`
  );
}

export async function runProductBaselineCli(command = process.argv[2]): Promise<void> {
  if (command === 'check') await check();
  else if (command === 'update') await update();
  else if (command === 'update-search') await updateSearch();
  else throw new Error(`Unknown product baseline command: ${command ?? '<missing>'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await runProductBaselineCli();
}
