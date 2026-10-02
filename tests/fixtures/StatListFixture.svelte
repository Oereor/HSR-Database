<script lang="ts">
  import StatList from '$lib/components/shared/StatList.svelte';
  import StatRow from '$lib/components/shared/StatRow.svelte';

  export let hasIcons = false;
  export let spacing: 'section' | 'flush' = 'section';
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
  />
  <StatRow
    label="synthetic text label"
    value="synthetic unavailable value"
    tone="unavailable"
    data-fixture-stat="text"
  />
</StatList>
