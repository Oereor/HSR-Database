<script lang="ts">
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import MaterialCostList from './MaterialCostList.svelte';
  import type { Cost, MaterialCatalog } from '$lib/domain/training/types';
  export let kind: 'upgrade' | 'promotion' | 'skill-trace' | 'total';
  export let title: string;
  export let cost: Cost;
  export let catalog: MaterialCatalog;
  export let onSelectMaterial: (itemId: string, trigger: HTMLButtonElement) => void = () =>
    undefined;
</script>

<div class="training-expense" data-training-expense={kind}>
  <SectionHeading level={kind === 'total' ? 1 : 2} headingLevel={3}>{title}</SectionHeading>
  <MaterialCostList {cost} {catalog} {onSelectMaterial} />
</div>

<style>
  .training-expense {
    min-width: 0;
  }
</style>
