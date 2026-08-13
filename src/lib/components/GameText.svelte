<script lang="ts">
  import { parseGameText } from '$lib/domain/game-text';

  export let text = '';

  $: tokens = parseGameText(text);
</script>

<span class="game-text">
  {#each tokens as token}
    {#if token.italic}<em
        class:game-text__unbreak={token.unbreak}
        data-game-color={token.color}
        style:color={token.color}>{token.value}</em
      >{:else}<span
        class:game-text__unbreak={token.unbreak}
        data-game-color={token.color}
        style:color={token.color}>{token.value}</span
      >{/if}
  {/each}
</span>
