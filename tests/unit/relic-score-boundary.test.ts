import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('relic score architecture boundary', () => {
  it('keeps scoring code independent of Enka raw data, the simulator and display parsing', () => {
    const files = readdirSync('src/lib/relic-score').filter((name) => name.endsWith('.ts'));
    const source = files
      .map((name) => readFileSync(`src/lib/relic-score/${name}`, 'utf8'))
      .join('\n');
    expect(source).not.toMatch(/api\/_player\/enka|HSR-Relic-Simulator-Cross-Platform/);
    expect(source).not.toMatch(/\.display\b|parseFloat\(/);
  });

  it('keeps production normalization separate from farming and simulation code', () => {
    const source = [
      readFileSync('src/lib/relic-score/normalize.ts', 'utf8'),
      readFileSync('api/_player/enka/pipeline.ts', 'utf8')
    ].join('\n');
    expect(source).not.toMatch(/(?:from|import\s*\()[^\n]*(?:farming|probability|simulat)/i);
    expect(source).not.toMatch(/HSR-Relic-Simulator-Cross-Platform/);
  });
});
