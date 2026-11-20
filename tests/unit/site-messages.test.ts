import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { validateMessageSource, verifyCompiledMessageFiles } from '../../scripts/messages';
import compilerOptions from '../../paraglide.config';

it('configures explicit locale URL routing with a base-locale fallback', () => {
  expect(compilerOptions.strategy).toEqual(['url', 'baseLocale']);
});

it('rejects duplicate or missing site-message keys and changed parameter shapes', () => {
  expect(() => validateMessageSource('{"common_close":"a","common_close":"b"}', {})).toThrow();
  expect(() => validateMessageSource('{}', { common_close: [] })).toThrow('Missing required');
  expect(() =>
    validateMessageSource('{"overview_result_count":"{total}"}', {
      overview_result_count: ['count']
    })
  ).toThrow('parameter contract');
});

it('rejects incomplete Paraglide output even when the compiler reports every file', async () => {
  const root = await mkdtemp(path.resolve('data/audit/site-messages-'));
  const index = 'messages/_index.js';
  const module = 'messages/example.js';
  const reported = { [index]: 'index-hash', [module]: 'module-hash' };
  try {
    await mkdir(path.join(root, 'messages'));
    await writeFile(path.join(root, index), 'export {}');
    await expect(verifyCompiledMessageFiles(root, reported)).rejects.toThrow(module);
    await writeFile(path.join(root, module), 'export {}');
    await expect(verifyCompiledMessageFiles(root, reported)).resolves.toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
