import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SearchBar from '../../src/lib/components/SearchBar.svelte';
import SectionNav from '../../src/lib/components/SectionNav.svelte';
import SectionHeadingFixture from '../fixtures/SectionHeadingFixture.svelte';

describe('SectionHeading', () => {
  it.each([
    [1, 'h2'],
    [2, 'h3'],
    [3, 'h4']
  ] as const)('maps visual level %i to a semantic %s by default', (level, tag) => {
    const { body } = render(SectionHeadingFixture, { props: { level } });

    expect(body).toMatch(new RegExp(`<${tag}[^>]*id="heading-${level}"`));
    expect(body).toContain('统一标题');
  });
});

describe('SectionNav', () => {
  it('renders semantic anchors and marks the first target current during SSR', () => {
    const { body } = render(SectionNav, {
      props: {
        items: [
          { id: 'stats', label: '属性' },
          { id: 'skills', label: '技能' }
        ]
      }
    });

    expect(body).toContain('<nav');
    expect(body).toContain('aria-label="详情章节"');
    expect(body).toContain('href="#stats"');
    expect(body).toContain('href="#skills"');
    expect(body).toContain('aria-current="location"');
    expect(body).toContain('属性');
    expect(body).toContain('技能');
  });
});

describe('SearchBar', () => {
  it('共享 canonical route 并将 Sidebar 可见标签关联到输入框', () => {
    const { body } = render(SearchBar, {
      props: {
        id: 'global-search',
        label: '全局搜索',
        placeholder: '搜索角色、光锥…',
        variant: 'sidebar'
      }
    });

    expect(body).toContain('<form');
    expect(body).toContain('action="/search"');
    expect(body).toMatch(/<label[^>]*for="global-search"[^>]*>全局搜索<\/label>/);
    expect(body).toContain('id="global-search"');
    expect(body).toContain('name="q"');
    expect(body).toContain('aria-label="开始搜索"');
  });
});
