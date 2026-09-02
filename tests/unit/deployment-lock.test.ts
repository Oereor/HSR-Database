import { describe, expect, it } from 'vitest';
import { parseUpstreamLock } from '../../scripts/deployment/lock';
import { resolveUpstreamRoot } from '../../scripts/deployment/prepare';

const valid = {
  schemaVersion: 1,
  turnBasedGameData: {
    repository: 'https://github.com/DimbreathBot/TurnBasedGameData.git',
    commit: '014e33e2404f8cd668bf06fc2ea6db53b6bc3992'
  },
  starRailRes: {
    repository: 'https://github.com/Mar-7th/StarRailRes.git',
    commit: 'd226befe3db13f2ec15f4161d5f34b1b607643fe'
  }
};

const invalidCases: Array<[string, unknown]> = [
  ['missing schemaVersion', { ...valid, schemaVersion: undefined }],
  ['schemaVersion', { ...valid, schemaVersion: 2 }],
  [
    'repository',
    { ...valid, turnBasedGameData: { ...valid.turnBasedGameData, repository: 'main' } }
  ],
  ...['main', 'v1.0.0', 'latest', 'HEAD', '014e33e'].map((commit): [string, unknown] => [
    `floating or incomplete commit ${commit}`,
    { ...valid, starRailRes: { ...valid.starRailRes, commit } }
  ]),
  ['missing pin', { ...valid, starRailRes: undefined }]
];

describe('upstream lock validation', () => {
  it('accepts exact repositories and full SHAs', () => {
    expect(parseUpstreamLock(valid)).toEqual(valid);
  });

  it.each(invalidCases)('rejects %s', (_, value) => {
    expect(() => parseUpstreamLock(value)).toThrow(/lock 无效/);
  });

  it('resolves the deployment checkout root below the site root', () => {
    expect(resolveUpstreamRoot('/site')).toMatch(/[\\/]site[\\/]\.upstream$/);
  });
});
