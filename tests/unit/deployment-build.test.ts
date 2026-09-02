import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runDeploymentBuild } from '../../scripts/deployment/build';
import { siteRoot } from '../../scripts/deployment/prepare';

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
  it('runs enemy ensure after data and before StarRailRes assets/build', async () => {
    const events: string[] = [];
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
      commandRunner: async (args) => {
        events.push(args.join(' '));
      }
    });
    expect(events).toEqual([
      'lock',
      'prepare-turn-based',
      'data:ensure',
      'assets:ensure:enemies',
      'prepare-star-rail',
      'assets:ensure',
      'exec svelte-kit sync',
      'exec vite build'
    ]);
  });
});
