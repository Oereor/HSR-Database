import { expect, it } from 'vitest';
import { validateMessageSource } from '../../scripts/messages';
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
