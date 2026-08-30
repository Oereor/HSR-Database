import { describe, expect, it } from 'vitest';
import { parseGameVersion } from '../../scripts/data/source-metadata';

describe('TurnBasedGameData source metadata', () => {
  it.each([
    ['OSPRODWin4.5.0_D16320393_A16307208_L16214083', '4.5.0', '4.5'],
    ['OSPRODWin4.4.0_D15909703_A15802547_L15874300', '4.4.0', '4.4'],
    ['OSPRODWin5.0.12_D1_A2_L3', '5.0.12', '5.0'],
    ['OSPRODWin12.34.56', '12.34.56', '12.34']
  ])('从 %s 解析完整与展示版本', (subject, full, display) => {
    expect(parseGameVersion(subject)).toEqual({
      gameVersionFull: full,
      gameVersion: display
    });
  });

  it.each([
    'release 4.5.0',
    'OSPRODWin4.5',
    'OSPRODWin04.5.0_D1',
    'prefix_OSPRODWin4.5.0_D1',
    'OSPRODWin4.5.0beta'
  ])('格式变化时返回明确未知而不伪造版本：%s', (subject) => {
    expect(parseGameVersion(subject)).toEqual({
      gameVersionFull: null,
      gameVersion: null
    });
  });
});
