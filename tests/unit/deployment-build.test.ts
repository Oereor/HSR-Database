import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runDeploymentBuild } from '../../scripts/deployment/build';
import {
  siteRoot,
  starRailAssetDirectories,
  starRailIndexPaths
} from '../../scripts/deployment/prepare';

const lock = {
  schemaVersion: 1 as const,
  turnBasedGameData: {
    repository: 'https://github.com/DimbreathBot/TurnBasedGameData.git',
    commit: '014e33e2404f8cd668bf06fc2ea6db53b6bc3992'
  },
  starRailRes: {
    repository: 'https://github.com/Mar-7th/StarRailRes.git',
    commit: 'd226befe3db13f2ec15f4161d5f34b1b607643fe'
  }
};

describe('deployment build orchestration', () => {
  it('stops before data generation when the tracked name snapshot is stale', async () => {
    const events: string[] = [];
    await expect(
      runDeploymentBuild({
        loadLock: async () => lock,
        prepareTurnBased: async () => path.join(siteRoot, '.upstream', 'TurnBasedGameData'),
        prepareStarRail: async () => {
          events.push('prepare-star-rail');
          return '';
        },
        commandRunner: async (args) => {
          events.push(args.join(' '));
          if (args[0] === 'check:scripts') return;
          throw new Error('Official name snapshot is stale: pnpm data:search-names:update');
        }
      })
    ).rejects.toThrow('pnpm data:search-names:update');
    expect(events).toEqual(['check:scripts', 'data:search-names:check']);
  });

  it('includes all StarRailRes indexes required by character detail icon resolution', () => {
    expect(starRailIndexPaths).toEqual(
      expect.arrayContaining([
        'index_new/cn/character_skills.json',
        'index_new/cn/character_skill_trees.json',
        'index_new/cn/character_ranks.json'
      ])
    );
    expect(starRailAssetDirectories).toEqual(
      expect.arrayContaining(['icon/skill/', 'icon/property/', 'icon/sign/'])
    );
  });

  it('runs enemy ensure after data and before StarRailRes assets/build', async () => {
    const events: string[] = [];
    const environments: NodeJS.ProcessEnv[] = [];
    await runDeploymentBuild({
      loadLock: async () => {
        events.push('lock');
        return lock;
      },
      prepareTurnBased: async () => {
        events.push('prepare-turn-based');
        return path.join(siteRoot, '.upstream', 'TurnBasedGameData');
      },
      prepareStarRail: async () => {
        events.push('prepare-star-rail');
        return path.join(siteRoot, '.upstream', 'StarRailRes');
      },
      commandRunner: async (args, env) => {
        events.push(args.join(' '));
        environments.push(env);
      }
    });
    expect(events).toEqual([
      'lock',
      'prepare-turn-based',
      'check:scripts',
      'data:search-names:check',
      'data:ensure',
      'assets:ensure:enemies',
      'prepare-star-rail',
      'assets:ensure',
      'assets:verify',
      'exec svelte-kit sync',
      'exec vite build',
      'deploy:verify'
    ]);
    expect(environments.every((env) => env.HSR_DEPLOYMENT_BUILD === '1')).toBe(true);
    expect(
      environments.every((env) => env.HSR_EXPECTED_ASSET_COMMIT === lock.starRailRes.commit)
    ).toBe(true);
  });
});
