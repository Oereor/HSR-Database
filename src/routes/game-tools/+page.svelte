<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import { localizedHref } from '$lib/i18n/routing';
  import { formatDocumentTitle } from '$lib/site';
  export let data;
</script>

<svelte:head>
  <title>{formatDocumentTitle(m.navigation_game_tools({}, { locale: data.locale }))}</title>
  <meta name="description" content={m.planner_description({}, { locale: data.locale })} />
</svelte:head>

<header class="tools-heading">
  <h1>{m.navigation_game_tools({}, { locale: data.locale })}</h1>
</header>
<a class="tool-link" href={localizedHref('/game-tools/action-planner', data.locale)}>
  <h2>{m.planner_title({}, { locale: data.locale })} <span aria-hidden="true">→</span></h2>
  <p>{m.planner_description({}, { locale: data.locale })}</p>
</a>

<style>
  .tools-heading {
    margin-bottom: var(--space-6);
  }
  h1 {
    font-size: var(--font-page-title);
  }
  .tool-link {
    display: block;
    max-width: 48rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: var(--surface);
    padding: var(--space-6);
  }
  .tool-link:hover {
    border-color: var(--gold);
  }
  h2 {
    font-size: var(--font-section-title);
  }
  h2 span {
    float: right;
    color: var(--gold);
  }
  p {
    color: var(--text-secondary);
    margin-top: var(--space-3);
  }
</style>
