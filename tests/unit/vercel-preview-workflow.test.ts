import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const workflowFile = path.resolve('.github/workflows/vercel-preview.yml');

describe('manual Vercel Preview workflow', () => {
  it('is manual-only and deploys the selected commit with bounded concurrency', async () => {
    const workflow = (await readFile(workflowFile, 'utf8')).replaceAll('\r\n', '\n');
    const triggers = workflow.match(/on:\n([\s\S]*?)\nconcurrency:/)?.[1].trim();

    expect(triggers).toBe('workflow_dispatch:');
    expect(workflow).toContain('group: vercel-preview');
    expect(workflow).toContain('cancel-in-progress: true');
    expect(workflow).toContain('timeout-minutes: 45');
    expect(workflow).toContain('ref: ${{ github.sha }}');
    expect(workflow).not.toMatch(/\n\s+(push|pull_request|schedule):/);
  });

  it('uses only the runtime needed for the pinned CLI and least-privilege permissions', async () => {
    const workflow = (await readFile(workflowFile, 'utf8')).replaceAll('\r\n', '\n');

    expect(workflow.match(/permissions:\n([\s\S]*?)\njobs:/)?.[1].trim()).toBe('contents: read');
    expect(workflow).toContain('uses: actions/checkout@v7');
    expect(workflow).toContain('uses: actions/setup-node@v7');
    expect(workflow).toContain('node-version: 22');
    expect(workflow).toContain('npm install --global vercel@59.16.0');
    expect(workflow).not.toContain('pnpm/action-setup');
    expect(workflow).not.toContain('cache: pnpm');
  });

  it('uploads source once and can only deploy a Vercel-hosted Preview build', async () => {
    const workflow = await readFile(workflowFile, 'utf8');
    const sourceDeploys = workflow.match(
      /vercel deploy --yes --target=preview --token="\$VERCEL_TOKEN"/g
    );

    expect(sourceDeploys).toHaveLength(1);
    expect(workflow).not.toContain('vercel pull');
    expect(workflow).not.toContain('vercel build');
    expect(workflow).not.toContain('--prebuilt');
    expect(workflow).not.toContain('vercel link');
    expect(workflow).not.toContain('pnpm install');
    expect(workflow).not.toContain('pnpm deploy:build');
    expect(workflow).not.toMatch(/--prod(?:\s|$)/m);
    expect(workflow).not.toContain('--target=production');
    expect(workflow).not.toContain('--no-wait');
  });

  it('uses repository secrets and exposes the resulting Preview URL', async () => {
    const workflow = await readFile(workflowFile, 'utf8');
    const secretNames = [...workflow.matchAll(/secrets\.([A-Z][A-Z0-9_]*)/g)].map(
      (match) => match[1]
    );

    expect([...new Set(secretNames)].sort()).toEqual([
      'VERCEL_ORG_ID',
      'VERCEL_PROJECT_ID',
      'VERCEL_TOKEN'
    ]);
    expect(workflow).toContain('id: deploy');
    expect(workflow).toContain('url=$deployment_url');
    expect(workflow).toContain('$GITHUB_STEP_SUMMARY');
    expect(workflow).toContain('steps.deploy.outputs.url');
    expect(workflow).toContain('$GITHUB_REF_NAME');
    expect(workflow).toContain('$GITHUB_SHA');
  });
});
