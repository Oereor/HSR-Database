import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const configFile = path.resolve('vercel.json');

describe('Vercel deployment configuration', () => {
  it('enables automatic deployments only for main', async () => {
    const config = JSON.parse(await readFile(configFile, 'utf8')) as unknown;

    expect(config).toEqual({
      $schema: 'https://openapi.vercel.sh/vercel.json',
      trailingSlash: true,
      git: {
        deploymentEnabled: {
          '**': false,
          main: true
        }
      }
    });
  });
});
