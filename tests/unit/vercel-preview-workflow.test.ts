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

  it('uses the established runtime and least-privilege permissions', async () => {
    const workflow = await readFile(workflowFile, 'utf8');

    expect(workflow.match(/permissions:\n([\s\S]*?)\njobs:/)?.[1].trim()).toBe('contents: read');
    expect(workflow).toContain('uses: actions/checkout@v7');
    expect(workflow).toContain('uses: actions/setup-node@v7');
    expect(workflow).toContain('uses: pnpm/action-setup@v4');
    expect(workflow).toContain('node-version: 22');
    expect(workflow).toContain('version: 11.9.0');
    expect(workflow).toContain('npm install --global vercel@59.16.0');
  });

  it('builds once through Vercel and can only deploy a Preview', async () => {
    const workflow = await readFile(workflowFile, 'utf8');
    const pull = workflow.indexOf('vercel pull --yes --environment=preview');
    const build = workflow.indexOf('vercel build --token=');
    const deploy = workflow.indexOf('vercel deploy --prebuilt --token=');

    expect(pull).toBeGreaterThan(0);
    expect(build).toBeGreaterThan(pull);
    expect(deploy).toBeGreaterThan(build);
    expect(workflow).not.toContain('pnpm install');
    expect(workflow).not.toContain('pnpm deploy:build');
    expect(workflow).not.toMatch(/--prod(?:\s|$)/m);
  });

  it('uses repository secrets and exposes the resulting Preview URL', async () => {
    const workflow = await readFile(workflowFile, 'utf8');

    for (const secret of ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'])
      expect(workflow).toContain(`secrets.${secret}`);
    expect(workflow).toContain('id: deploy');
    expect(workflow).toContain('url=$deployment_url');
    expect(workflow).toContain('$GITHUB_STEP_SUMMARY');
    expect(workflow).toContain('steps.deploy.outputs.url');
    expect(workflow).toContain('$GITHUB_REF_NAME');
    expect(workflow).toContain('$GITHUB_SHA');
  });
});
