import { get, writable } from 'svelte/store';

export function responsivePageSize(target: number, columns: number): number {
  return Number.isInteger(columns) && columns > 0
    ? columns * Math.max(1, Math.round(target / columns))
    : target;
}

export function paginationState(total: number, pageSize: number, requestedPage: number) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage =
    Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pages) : 1;
  return { pageSize, pages, currentPage };
}

export function pageContaining(index: number, pageSize: number): number {
  return Math.floor(Math.max(0, index) / pageSize) + 1;
}

/** One instance per catalog; URL navigation remains authoritative. */
export function createOverviewPagination(target: number, replaceUrl: (url: URL) => Promise<void>) {
  const state = writable(paginationState(0, target, 1));
  let url: URL | undefined;
  let total = 0;
  let busy = false;
  let columns = 0;
  let measured = false;
  let anchor: number | undefined;
  let pendingHref: string | undefined;
  let revision = 0;

  function applyColumns() {
    if (!url || busy || !columns) return;
    const previous = get(state);
    const pageSize = responsivePageSize(target, columns);
    const resized = measured && pageSize !== previous.pageSize;
    const requested = Number(url.searchParams.get('page') ?? 1);
    if (resized) anchor ??= (previous.currentPage - 1) * previous.pageSize;
    const next = paginationState(
      total,
      pageSize,
      resized ? pageContaining(anchor!, pageSize) : requested
    );
    measured = true;
    state.set(next);
    // Preserve omitted page=1; only normalize an explicitly invalid/out-of-range page.
    if (next.currentPage === requested) return;
    const nextUrl = new URL(url);
    nextUrl.searchParams.set('page', String(next.currentPage));
    const sourceHref = url.href;
    const token = ++revision;
    queueMicrotask(() => {
      if (token !== revision || busy || url?.href !== sourceHref) return;
      pendingHref = nextUrl.href;
      void replaceUrl(nextUrl).catch(() => {
        // A superseding navigation wins; restore the authoritative URL on failure.
        if (pendingHref !== nextUrl.href) return;
        pendingHref = undefined;
        anchor = undefined;
        state.set(
          paginationState(total, get(state).pageSize, Number(url?.searchParams.get('page') ?? 1))
        );
      });
    });
  }

  return {
    subscribe: state.subscribe,
    synchronize(nextUrl: URL | undefined, nextTotal: number, navigating = false) {
      const changed = nextUrl?.href !== url?.href;
      const totalChanged = nextTotal !== total;
      const wasBusy = busy;
      if (changed || navigating !== busy) revision++;
      busy = navigating;
      total = nextTotal;
      if (changed) {
        if (nextUrl?.href !== pendingHref) anchor = undefined;
        pendingHref = undefined;
        url = nextUrl ? new URL(nextUrl) : undefined;
      }
      if (changed || totalChanged || !url) {
        state.set(
          paginationState(total, get(state).pageSize, Number(url?.searchParams.get('page') ?? 1))
        );
      }
      if (!busy && (changed || totalChanged || wasBusy)) applyColumns();
    },
    setColumns(next: number) {
      if (!Number.isInteger(next) || next < 1) return;
      columns = next;
      applyColumns();
    }
  };
}
