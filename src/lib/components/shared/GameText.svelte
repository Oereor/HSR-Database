<script lang="ts">
  import { parseGameText } from '$lib/domain/game-text';
  import InlineGameTextToken from '$lib/components/shared/InlineGameTextToken.svelte';

  export let text = '';

  $: tokens = parseGameText(text);
</script>

<span class="game-text">
  {#each tokens as token}
    <InlineGameTextToken {token} />
  {/each}
</span>
