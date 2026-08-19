<script lang="ts">
  import type { DescriptionToken } from '$lib/domain/types';

  export let tokens: DescriptionToken[] = [];
</script>

{#each tokens as token}
  {#if token.underline && token.italic}<u
      class:description-token--unbreak={token.unbreak}
      class:scaling-value={token.type === 'scaling-value'}
      style:color={token.color}><em>{token.value}</em></u
    >{:else if token.underline}<u
      class:description-token--unbreak={token.unbreak}
      class:scaling-value={token.type === 'scaling-value'}
      style:color={token.color}>{token.value}</u
    >{:else if token.italic}<em
      class:description-token--unbreak={token.unbreak}
      class:scaling-value={token.type === 'scaling-value'}
      style:color={token.color}>{token.value}</em
    >{:else}<span
      class:description-token--unbreak={token.unbreak}
      class:scaling-value={token.type === 'scaling-value'}
      style:color={token.color}>{token.value}</span
    >{/if}
{/each}
