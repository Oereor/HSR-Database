<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/stores';
  import { formatDocumentTitle } from '$lib/site';
  import { localizedHref } from '$lib/i18n/routing';
  import { m } from '$lib/paraglide/messages.js';
  import { Button } from '$lib/components/ui/button';
  import * as Empty from '$lib/components/ui/empty';
</script>

<svelte:head><title>{formatDocumentTitle(String($page.status))}</title></svelte:head>
<Empty.Root
  tag="section"
  class="error-state border-border mx-auto mt-[15vh] mb-12 block flex-none rounded-[var(--radius-panel)] border px-8 py-16 text-wrap md:px-8 md:py-16 [&_p]:mx-auto [&_p]:mt-0 [&_p]:mb-6"
>
  <p class="kicker mb-6!">ERROR {$page.status}</p>
  <h1>{$page.status === 404 ? m.error_not_found() : m.error_load_failed()}</h1>
  <p>{$page.error?.message ?? m.error_retry()}</p>
  <Button href={localizedHref(resolve('/'))}>{m.error_back_home()}</Button>
</Empty.Root>
