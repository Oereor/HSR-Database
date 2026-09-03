import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const workflowFile = path.resolve('.github/workflows/update-upstreams.yml');

describe('update upstreams workflow', () => {
  it('uses the expected triggers, runtime, permissions and concurrency policy', async () => {
    const workflow = await readFile(workflowFile, 'utf8');
    expect(workflow).toContain("cron: '17 3 * * *'");
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('group: update-upstreams');
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain('contents: write');
    expect(workflow).toContain('pull-requests: write');
    expect(workflow).toContain('uses: actions/checkout@v7');
    expect(workflow).toContain('uses: actions/setup-node@v7');
    expect(workflow).toContain('uses: pnpm/action-setup@v4');
    expect(workflow).toContain('node-version: 22');
    expect(workflow).toContain('version: 11.9.0');
  });

  it('targets develop through one fixed automation branch', async () => {
    const workflow = await readFile(workflowFile, 'utf8');
    expect(workflow).toContain('ref: develop');
    expect(workflow).toContain('AUTOMATION_BRANCH: automation/update-upstreams');
    expect(workflow).toContain('git checkout -B "$AUTOMATION_BRANCH" origin/develop');
    expect(workflow).toContain('--force-with-lease=');
    expect(workflow).toContain('gh pr list --base develop --head "$AUTOMATION_BRANCH"');
    expect(workflow).toContain('gh pr create --base develop --head "$AUTOMATION_BRANCH"');
    expect(workflow).not.toMatch(/git push[^\n]*(?:develop|main)/);
  });

  it('gates validation, push and PR operations behind a real lock diff', async () => {
    const workflow = await readFile(workflowFile, 'utf8');
    const changeCheck = workflow.indexOf('git diff --quiet -- upstream.lock.json');
    const build = workflow.indexOf('run: pnpm deploy:build');
    const push = workflow.indexOf('name: Push automation branch');
    const pullRequest = workflow.indexOf('name: Create or update pull request');
    expect(changeCheck).toBeGreaterThan(0);
    expect(build).toBeGreaterThan(changeCheck);
    expect(push).toBeGreaterThan(build);
    expect(pullRequest).toBeGreaterThan(push);
    expect(
      workflow.match(/if: steps\.changes\.outputs\.changed == 'true'/g)?.length
    ).toBeGreaterThanOrEqual(6);
  });
});
