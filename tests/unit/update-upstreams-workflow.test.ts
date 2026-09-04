import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { syncPlayerAliasSkeleton } from '../../scripts/data/player-aliases';
import { buildSearchDocuments, type SearchBuildInputs } from '../../scripts/data/search-documents';
import type { CharacterNameSnapshot } from '../../src/lib/search/name-metadata';

const workflowFile = path.resolve('.github/workflows/update-upstreams.yml');

describe('update upstreams workflow', () => {
  it('uses the expected triggers, runtime, permissions and concurrency policy', async () => {
    const workflow = (await readFile(workflowFile, 'utf8')).replaceAll('\r\n', '\n');
    expect(workflow).toContain("cron: '17 3 * * *'");
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('group: update-upstreams');
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain('contents: write');
    expect(workflow).toContain('pull-requests: write');
    expect(workflow.match(/permissions:\n([\s\S]*?)\njobs:/)?.[1].trim()).toBe(
      'contents: write\n  pull-requests: write'
    );
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
    expect(workflow).not.toMatch(/gh pr (?:merge|review)/);
  });

  it('gates validation, push and PR operations behind a real lock diff', async () => {
    const workflow = await readFile(workflowFile, 'utf8');
    const changeCheck = workflow.indexOf('git diff --quiet -- upstream.lock.json');
    const build = workflow.indexOf('run: pnpm deploy:build');
    const refresh = workflow.indexOf('run: pnpm data:search-names:update');
    const sync = workflow.indexOf('run: pnpm data:player-aliases:sync');
    const push = workflow.indexOf('name: Push automation branch');
    const pullRequest = workflow.indexOf('name: Create or update pull request');
    expect(changeCheck).toBeGreaterThan(0);
    expect(build).toBeGreaterThan(changeCheck);
    expect(refresh).toBeGreaterThan(changeCheck);
    expect(sync).toBeGreaterThan(refresh);
    expect(build).toBeGreaterThan(sync);
    expect(workflow).toContain(
      'git add upstream.lock.json data/search/character-official-names.generated.json data/search/character-player-aliases.json'
    );
    expect(push).toBeGreaterThan(build);
    expect(pullRequest).toBeGreaterThan(push);
    expect(
      workflow.match(/if: steps\.changes\.outputs\.changed == 'true'/g)?.length
    ).toBeGreaterThanOrEqual(6);
  });

  it('replays the real workflow metadata phase for a new character before deployment validation', async () => {
    const workflow = (await readFile(workflowFile, 'utf8')).replaceAll('\r\n', '\n');
    const steps = workflow.split(/^ {6}- name: /m).flatMap((block) => {
      const command = block.match(
        /^ {8}run: pnpm (data:search-names:update|data:player-aliases:sync|deploy:build)$/m
      )?.[1];
      if (!command) return [];
      expect(block).toContain("if: steps.changes.outputs.changed == 'true'");
      return [command];
    });
    expect(steps).toEqual(['data:search-names:update', 'data:player-aliases:sync', 'deploy:build']);
    expect(workflow.match(/git add ([^\n]+)/)?.[1].split(' ')).toEqual([
      'upstream.lock.json',
      'data/search/character-official-names.generated.json',
      'data/search/character-player-aliases.json'
    ]);
    const dir = await mkdtemp(path.resolve('data/audit/hsr-updater-integration-'));
    try {
      const files = {
        official: path.join(dir, 'official.json'),
        aliases: path.join(dir, 'manual.json')
      };
      const names = (ids: string[]): CharacterNameSnapshot => ({
        schemaVersion: 1,
        normalizationVersion: 1,
        namingPolicyVersion: 1,
        sourceCommit: 'fixture',
        characters: Object.fromEntries(
          ids.map((id) => [
            id,
            {
              canonicalName: `角色${id}`,
              canonicalSource: {
                table: 'AvatarConfig',
                recordId: id,
                field: 'AvatarName',
                textHash: id,
                policy: 'avatar-name'
              },
              officialAliases: []
            }
          ])
        )
      });
      const old = names(['1001', '1002']);
      const updated = names(['1001', '1002', '1555']);
      const existing =
        '{\n  "schemaVersion": 1,\n  "characters": {\n    "1001": {"playerAliases": ["A", "B"]},\n    "1002": {"playerAliases": ["C"]}\n  }\n}\n';
      await writeFile(files.official, JSON.stringify(old));
      await writeFile(files.aliases, existing);
      let validated = false;
      for (const command of steps) {
        if (command === 'data:search-names:update')
          await writeFile(files.official, JSON.stringify(updated));
        else if (command === 'data:player-aliases:sync') await syncPlayerAliasSkeleton(files);
        else {
          const official = JSON.parse(
            await readFile(files.official, 'utf8')
          ) as CharacterNameSnapshot;
          const inputs: SearchBuildInputs = {
            official,
            catalogs: {
              character: Object.entries(official.characters).map(([id, row]) => ({
                id,
                name: row.canonicalName
              })),
              'light-cone': [],
              relic: [],
              enemy: []
            },
            endgameEnemies: []
          };
          const beforeValidation = await readFile(files.aliases, 'utf8');
          const result = buildSearchDocuments(inputs, JSON.parse(beforeValidation));
          expect(result.documents.map((doc) => doc.target)).toHaveLength(3);
          expect(await readFile(files.aliases, 'utf8')).toBe(beforeValidation);
          validated = true;
        }
      }
      expect(validated).toBe(true);
      const result = await readFile(files.aliases, 'utf8');
      expect(result).toContain('"1001": {"playerAliases": ["A", "B"]}');
      expect(result).toContain('"1002": {"playerAliases": ["C"]}');
      expect(JSON.parse(result).characters).toEqual({
        '1001': { playerAliases: ['A', 'B'] },
        '1002': { playerAliases: ['C'] },
        '1555': { playerAliases: [] }
      });
      expect(await syncPlayerAliasSkeleton(files)).toBe(false);
      expect(await readFile(files.aliases, 'utf8')).toBe(result);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
