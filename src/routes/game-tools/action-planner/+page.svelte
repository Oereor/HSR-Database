<script lang="ts">
  import ActionPlanner from '$lib/components/action-planner/ActionPlanner.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import { formatDocumentTitle } from '$lib/site';
  export let data;
</script>

<svelte:head>
  <title>{formatDocumentTitle(m.planner_title({}, { locale: data.locale }))}</title>
  <meta name="description" content={m.planner_description({}, { locale: data.locale })} />
</svelte:head>
<ActionPlanner characters={data.characters} presets={data.presets} locale={data.locale} />
