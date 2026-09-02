import { describe, expect, it } from 'vitest';
import { formatDocumentTitle, SITE_NAME } from '$lib/site';

describe('站点品牌标题', () => {
  it('使用正式站名并保持页面、分类、站名的全角分隔结构', () => {
    expect(SITE_NAME).toBe('《崩坏：星穹铁道》档案库');
    expect(formatDocumentTitle('三月七', '角色')).toBe('三月七｜角色｜《崩坏：星穹铁道》档案库');
    expect(formatDocumentTitle('角色')).toBe('角色｜《崩坏：星穹铁道》档案库');
    expect(formatDocumentTitle()).toBe(SITE_NAME);
  });
});
