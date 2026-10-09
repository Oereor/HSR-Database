<script lang="ts">
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import MaterialCostList from './MaterialCostList.svelte';
  import type { Cost, MaterialCatalog } from '$lib/domain/training/types';
  export let kind: 'upgrade' | 'promotion' | 'skill-trace' | 'total';
  export let title: string;
  export let cost: Cost;
  export let catalog: MaterialCatalog;
</script>

<div
  class="training-expense"
  class:training-exp={kind === 'upgrade'}
  class:training-total={kind === 'total'}
  data-training-expense={kind}
>
  <SectionHeading level={kind === 'total' ? 1 : 2} headingLevel={3}>{title}</SectionHeading>
  <slot name="summary" />
  <MaterialCostList {cost} {catalog} />
  <slot />
</div>

<style>
  .training-expense {
    border-top: 1px solid var(--border);
    padding-top: var(--space-6);
    min-width: 0;
  }
  .training-total {
    border-top: 2px solid var(--border-strong);
    margin-top: var(--space-3);
    padding-top: var(--space-6);
  }
</style>
