<script lang="ts">
  import StatList from '$lib/components/shared/StatList.svelte';
  import StatRow from '$lib/components/shared/StatRow.svelte';
  import SemanticIconLabel from '$lib/components/shared/SemanticIconLabel.svelte';

  export let hasIcons = false;
  export let spacing: 'section' | 'flush' = 'section';
  export let customLabel = false;
</script>

<StatList
  ariaLabel="synthetic stat list"
  class="synthetic-list"
  data-fixture-list="stats"
  {hasIcons}
  {spacing}
>
  <StatRow
    label="synthetic numeric label"
    value={1234}
    iconUrl={hasIcons ? '/synthetic-icon.png' : undefined}
    data-fixture-stat="numeric"
  >
    <svelte:fragment slot="label">
      {#if customLabel}
        <SemanticIconLabel kind="element" code="Fire" label="synthetic element" color="#abcdef" />
      {:else}synthetic numeric label{/if}
    </svelte:fragment>
  </StatRow>
  <StatRow
    label="synthetic text label"
    value="synthetic unavailable value"
    tone="unavailable"
    data-fixture-stat="text"
  />
</StatList>
