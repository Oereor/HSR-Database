<script lang="ts">
  export let currentPage = 1;
  export let pages = 1;
  export let queryString = '';

  function pageUrl(query: string, page: number) {
    const next = new URLSearchParams(query);
    next.set('page', String(page));
    return `?${next}`;
  }
</script>

{#if pages > 1}
  <nav class="overview-pagination" aria-label="分页">
    {#if currentPage > 1}<a href={pageUrl(queryString, currentPage - 1)}>上一页</a>{/if}
    <div class="overview-pagination__pages">
      {#each [...Array(pages).keys()] as pageIndex}
        <a
          href={pageUrl(queryString, pageIndex + 1)}
          aria-current={currentPage === pageIndex + 1 ? 'page' : undefined}
        >
          {pageIndex + 1}
        </a>
      {/each}
    </div>
    <span>第 {currentPage} / {pages} 页</span>
    {#if currentPage < pages}<a href={pageUrl(queryString, currentPage + 1)}>下一页</a>{/if}
  </nav>
{/if}

<style>
  .overview-pagination {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    gap: 1rem;
    margin: 2.5rem 0;
    color: var(--muted);
    font-size: 0.8rem;
  }

  .overview-pagination a {
    color: var(--gold);
  }

  .overview-pagination__pages {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.35rem;
  }

  .overview-pagination__pages a {
    min-width: 1.8rem;
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 0.25rem 0.4rem;
    text-align: center;
  }

  .overview-pagination__pages a[aria-current='page'] {
    border-color: var(--gold);
    background: rgb(215 181 109 / 10%);
  }
</style>
