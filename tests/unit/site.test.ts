import { afterEach, describe, expect, it } from 'vitest';
import { getLocale, overwriteGetLocale } from '$lib/paraglide/runtime.js';
import { formatDocumentTitle, siteName } from '$lib/site';

const originalGetLocale = getLocale;

afterEach(() => overwriteGetLocale(originalGetLocale));

describe('站点品牌标题', () => {
  it('保持页面、分类、runtime locale 站名的全角分隔结构', () => {
    overwriteGetLocale(() => 'zh-CN');
    expect(formatDocumentTitle('Page', 'Category')).toBe(`Page｜Category｜${siteName('zh-CN')}`);
    expect(formatDocumentTitle('Page')).toBe(`Page｜${siteName('zh-CN')}`);
    expect(formatDocumentTitle()).toBe(siteName('zh-CN'));

    overwriteGetLocale(() => 'en');
    expect(formatDocumentTitle('Page')).toBe(`Page｜${siteName('en')}`);
  });
});
