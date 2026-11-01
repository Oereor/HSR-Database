import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  createOverviewPagination,
  paginationState,
  pageContaining,
  responsivePageSize
} from '../../src/lib/components/shared/overview-pagination';

const url = (query = '') => new URL(`https://example.test/en/enemies/?${query}#catalog`);

describe('responsive catalog pagination', () => {
  it.each([
    [36, 1, 36],
    [36, 5, 35],
    [36, 8, 40],
    [48, 5, 50],
    [36, 80, 80],
    [36, 0, 36]
  ])('rounds target %i to columns %i -> %i', (target, columns, expected) => {
    expect(responsivePageSize(target, columns)).toBe(expected);
  });
  it('clamps pages and finds the page containing the old first item', () => {
    expect(paginationState(0, 35, 8)).toEqual({ pageSize: 35, pages: 1, currentPage: 1 });
    for (const requested of [0, -1, NaN, 1.5])
      expect(paginationState(80, 35, requested).currentPage).toBe(1);
    expect(paginationState(80, 35, 999).currentPage).toBe(3);
    expect(pageContaining(70, 40)).toBe(2);
  });
  it('keeps SSR deterministic and interprets initial URL with responsive capacity', async () => {
    const replace = vi.fn<(url: URL) => Promise<void>>().mockResolvedValue(undefined);
    const pager = createOverviewPagination(36, replace);
    pager.synchronize(undefined, 100);
    expect(get(pager)).toEqual({ pageSize: 36, pages: 3, currentPage: 1 });
    pager.synchronize(url('page=2'), 100);
    pager.setColumns(8);
    expect(get(pager)).toEqual({ pageSize: 40, pages: 3, currentPage: 2 });
    await Promise.resolve();
    expect(replace).not.toHaveBeenCalled();
  });
  it('retains the original anchor across resize transitions and preserves URL parameters', async () => {
    const replace = vi.fn<(url: URL) => Promise<void>>().mockResolvedValue(undefined);
    const pager = createOverviewPagination(36, replace);
    pager.synchronize(url('page=2&keep=a&keep=b&sort=id'), 200);
    pager.setColumns(5);
    pager.setColumns(8);
    expect(get(pager).currentPage).toBe(1);
    await Promise.resolve();
    const destination = replace.mock.calls[0][0] as URL;
    expect(destination.pathname).toBe('/en/enemies/');
    expect(destination.hash).toBe('#catalog');
    expect(destination.searchParams.getAll('keep')).toEqual(['a', 'b']);
    expect(destination.searchParams.get('sort')).toBe('id');
    pager.synchronize(destination, 200);
    pager.setColumns(5);
    expect(get(pager).currentPage).toBe(2);
  });
  it('lets a newer navigation supersede a queued replacement and defers width updates during navigation', async () => {
    const replace = vi.fn<(url: URL) => Promise<void>>().mockResolvedValue(undefined);
    const pager = createOverviewPagination(36, replace);
    pager.synchronize(url('page=2'), 200);
    pager.setColumns(5);
    pager.setColumns(8);
    pager.synchronize(url('page=3'), 200, true);
    pager.setColumns(7);
    await Promise.resolve();
    expect(replace).not.toHaveBeenCalled();
    pager.synchronize(url('page=3'), 200, false);
    expect(get(pager).pageSize).toBe(35);
    expect(get(pager).currentPage).toBe(3);
  });
});
