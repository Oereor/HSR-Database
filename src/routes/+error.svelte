<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/stores';
  import { formatDocumentTitle } from '$lib/site';
  import { localizedHref } from '$lib/i18n/routing';
  import { m } from '$lib/paraglide/messages.js';
</script>

<svelte:head><title>{formatDocumentTitle(String($page.status))}</title></svelte:head>
<section class="empty-state error-state">
  <p class="kicker">ERROR {$page.status}</p>
  <h1>{$page.status === 404 ? m.error_not_found() : m.error_load_failed()}</h1>
  <p>{$page.error?.message ?? m.error_retry()}</p>
  <a class="button" href={localizedHref(resolve('/'))}>{m.error_back_home()}</a>
</section>
