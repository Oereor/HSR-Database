import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { validateMessageSource } from '../../scripts/messages';
import { m } from '../../src/lib/paraglide/messages.js';
import compilerOptions from '../../paraglide.config';

it('renders both configured site-message catalogs with explicit locale and matching parameters', async () => {
  const english = JSON.parse(await readFile('messages/en.json', 'utf8')) as Record<string, string>;
  expect(m.home_recent_character_warp({}, { locale: 'zh-CN' })).toBe('最近限定角色跃迁');
  expect(m.home_recent_light_cone_warp({}, { locale: 'zh-CN' })).toBe('最近限定光锥跃迁');
  expect(m.overview_page_count({ currentPage: 2, pages: 9 }, { locale: 'zh-CN' })).toBe(
    '第 2 / 9 页'
  );
  expect(m.overview_result_count({ count: 100 }, { locale: 'zh-CN' })).toBe('共 100 个结果');
  expect(m.home_recent_character_warp({}, { locale: 'en' })).toBe(
    english.home_recent_character_warp
  );
  expect(m.overview_page_count({ currentPage: 2, pages: 9 }, { locale: 'en' })).toBe(
    english.overview_page_count.replace('{currentPage}', '2').replace('{pages}', '9')
  );
  expect(m.overview_result_count({ count: 100 }, { locale: 'en' })).toBe(
    english.overview_result_count.replace('{count}', '100')
  );
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
