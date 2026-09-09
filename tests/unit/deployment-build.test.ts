import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AssetValidationContext } from '../../scripts/assets/ensure';
import {
  resolveDeploymentMode,
  runDeploymentBuild,
  type DeploymentBuildDependencies
} from '../../scripts/deployment/build';
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

const context = {} as AssetValidationContext;

function dependencies(
  events: string[],
  environment: NodeJS.ProcessEnv = {}
): DeploymentBuildDependencies {
  return {
    environment,
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
    },
    ensureGeneralAssets: async () => {
      events.push('assets-ensure');
      return context;
    },
    verifyGeneralAssets: async () => {
      events.push('assets-verify');
    }
  };
}

describe('deployment mode resolution', () => {
  it.each([
    ['production', 'production-ci-backed'],
    ['preview', 'preview-full'],
    ['development', 'preview-full'],
    [undefined, 'preview-full'],
    ['unknown', 'preview-full']
  ] as const)('maps %s to %s', (value, expected) => {
    expect(resolveDeploymentMode(value)).toBe(expected);
  });
});

describe('deployment build orchestration', () => {
  it('stops before data generation when the full-path name snapshot is stale', async () => {
    const events: string[] = [];
    const deps = dependencies(events, { VERCEL_ENV: 'preview' });
    deps.commandRunner = async (args) => {
      events.push(args.join(' '));
      if (args[0] === 'check:scripts') return;
      if (args[0] === 'data:search-names:check')
        throw new Error('Official name snapshot is stale: pnpm data:search-names:update');
    };
    await expect(runDeploymentBuild(deps)).rejects.toThrow('pnpm data:search-names:update');
    expect(events).toContain('check:scripts');
    expect(events).toContain('data:search-names:check');
    expect(events).not.toContain('data:ensure');
  });

  it('keeps prerequisite ordering while allowing independent stages to overlap', async () => {
    const events: string[] = [];
    const environments: NodeJS.ProcessEnv[] = [];
    const deps = dependencies(events, { VERCEL_ENV: 'preview' });
    deps.commandRunner = async (args, env) => {
      events.push(args.join(' '));
      environments.push(env);
    };
    await runDeploymentBuild(deps);

    const before = (first: string, second: string) =>
      expect(events.indexOf(first)).toBeLessThan(events.indexOf(second));
    before('prepare-turn-based', 'data:ensure');
    before('data:search-names:check', 'data:ensure');
    before('data:ensure', 'assets:ensure:enemies');
    before('data:ensure', 'assets-ensure');
    before('prepare-star-rail', 'assets-ensure');
    before('assets-verify', 'exec svelte-kit sync');
    before('assets:ensure:enemies', 'exec svelte-kit sync');
    before('exec vite build', 'deploy:verify');
    expect(environments.every((env) => env.HSR_DEPLOYMENT_BUILD === '1')).toBe(true);
  });

  it.each([
    ['preview', 'check:scripts'],
    ['production', 'messages:compile']
  ] as const)(
    'waits for generated messages before loading Paraglide consumers in %s',
    async (vercelEnv, messageCommand) => {
      const events: string[] = [];
      let signalMessageStarted!: () => void;
      let releaseMessages!: () => void;
      const messageStarted = new Promise<void>((resolve) => {
        signalMessageStarted = resolve;
      });
      const messagesReady = new Promise<void>((resolve) => {
        releaseMessages = resolve;
      });
      const deps = dependencies(events, { VERCEL_ENV: vercelEnv });
      deps.commandRunner = async (args) => {
        const command = args.join(' ');
        events.push(command);
        if (command === messageCommand) {
          events.push('messages-started');
          signalMessageStarted();
          await messagesReady;
          events.push('messages-ready');
        }
      };

      const build = runDeploymentBuild(deps);
      await messageStarted;
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(events).not.toContain('assets-ensure');
      expect(events).not.toContain('assets-verify');

      releaseMessages();
      await build;
      expect(events.indexOf('messages-ready')).toBeLessThan(events.indexOf('assets-ensure'));
      expect(events.indexOf('messages-ready')).toBeLessThan(events.indexOf('assets-verify'));
    }
  );

  it('uses generated-message preparation and skips repository checks in production', async () => {
    const events: string[] = [];
    await runDeploymentBuild(dependencies(events, { VERCEL_ENV: 'production' }));
    expect(events).toContain('messages:compile');
    expect(events).not.toContain('check:scripts');
    expect(events).not.toContain('data:search-names:check');
    expect(events).toContain('data:ensure');
    expect(events).toContain('deploy:verify');
  });

  it('reports failures from both parallel asset branches', async () => {
    const events: string[] = [];
    const deps = dependencies(events);
    deps.commandRunner = async (args) => {
      if (args[0] === 'assets:ensure:enemies') throw new Error('enemy failed');
      events.push(args.join(' '));
    };
    deps.ensureGeneralAssets = async () => {
      throw new Error('general failed');
    };
    await expect(runDeploymentBuild(deps)).rejects.toThrow(/Asset preparation failed/);
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
});
