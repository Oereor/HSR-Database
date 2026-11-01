<script lang="ts">
  import * as Pagination from '$lib/components/ui/pagination';
  import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
  import { m } from '$lib/paraglide/messages.js';
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
  <Pagination.Root
    class="overview-pagination my-8 flex-col items-center gap-3"
    aria-label={m.pagination_aria()}
  >
    <Pagination.Content>
      {#if currentPage > 1}<Pagination.Item
          ><Pagination.Link href={pageUrl(queryString, currentPage - 1)} size="default" rel="prev"
            ><ChevronLeftIcon aria-hidden="true" />{m.pagination_previous()}</Pagination.Link
          ></Pagination.Item
        >{/if}
      {#each [...Array(pages).keys()] as pageIndex}
        <Pagination.Item
          ><Pagination.Link
            href={pageUrl(queryString, pageIndex + 1)}
            isActive={currentPage === pageIndex + 1}>{pageIndex + 1}</Pagination.Link
          ></Pagination.Item
        >
      {/each}
      {#if currentPage < pages}<Pagination.Item
          ><Pagination.Link href={pageUrl(queryString, currentPage + 1)} size="default" rel="next"
            >{m.pagination_next()}<ChevronRightIcon aria-hidden="true" /></Pagination.Link
          ></Pagination.Item
        >{/if}
    </Pagination.Content>
    <span class="text-muted-foreground text-sm"
      >{m.overview_page_count({ currentPage, pages })}</span
    >
  </Pagination.Root>
{/if}
