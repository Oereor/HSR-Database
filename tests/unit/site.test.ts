import { afterEach, describe, expect, it } from 'vitest';
import { getLocale, overwriteGetLocale } from '$lib/paraglide/runtime.js';
import { formatDocumentTitle, siteName } from '$lib/site';

const originalGetLocale = getLocale;

afterEach(() => overwriteGetLocale(originalGetLocale));

describe('站点品牌标题', () => {
  it('支持显式选择中英文站名', () => {
    expect(siteName('zh-CN')).toBe('《崩坏：星穹铁道》档案库');
    expect(siteName('en')).toBe('HSR DATA ARCHIVE');
  });

  it('保持页面、分类、runtime locale 站名的全角分隔结构', () => {
    overwriteGetLocale(() => 'zh-CN');
    expect(formatDocumentTitle('三月七', '角色')).toBe('三月七｜角色｜《崩坏：星穹铁道》档案库');
    expect(formatDocumentTitle('角色')).toBe('角色｜《崩坏：星穹铁道》档案库');
    expect(formatDocumentTitle()).toBe(siteName('zh-CN'));

    overwriteGetLocale(() => 'en');
    expect(formatDocumentTitle('Characters')).toBe('Characters｜HSR DATA ARCHIVE');
  });
});
