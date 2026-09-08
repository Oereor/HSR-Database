import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const workflowFile = path.resolve('.github/workflows/ci.yml');

describe('pull request correctness workflow', () => {
  it('exposes one stable required check for main pull requests only', async () => {
    const workflow = (await readFile(workflowFile, 'utf8')).replaceAll('\r\n', '\n');
    expect(workflow).toContain('name: CI');
    expect(workflow).toMatch(/pull_request:\n\s+branches:\n\s+- main/);
    expect(workflow).not.toMatch(/pull_request:\n[\s\S]*?branches:\n(?:\s+- .*\n)*\s+- develop/);
    expect(workflow).toContain('correctness:');
    expect(workflow).toContain('name: Correctness');
    expect(workflow).toContain('cancel-in-progress: true');
    expect(workflow).not.toMatch(/\n\s+paths(?:-ignore)?:/);
  });

  it('uses read-only permissions and runs the complete contract on one runner', async () => {
    const workflow = (await readFile(workflowFile, 'utf8')).replaceAll('\r\n', '\n');
    expect(workflow.match(/permissions:\n([\s\S]*?)\njobs:/)?.[1].trim()).toBe('contents: read');
    expect(workflow).toContain('pnpm install --frozen-lockfile');
    for (const command of [
      'pnpm messages:check',
      'pnpm check',
      'pnpm lint',
      'pnpm ci:prepare',
      'pnpm test',
      'pnpm data:search-names:check',
      'pnpm data:validate',
      'pnpm build',
      'pnpm test:e2e:smoke'
    ])
      expect(workflow).toContain(`run: ${command}`);
    expect(workflow.indexOf('run: pnpm messages:check')).toBeLessThan(
      workflow.indexOf('run: pnpm ci:prepare')
    );
    expect(workflow.indexOf('run: pnpm ci:prepare')).toBeLessThan(
      workflow.indexOf('run: pnpm check')
    );
    expect(workflow).toContain("PLAYWRIGHT_REUSE_BUILD: '1'");
  });
});
