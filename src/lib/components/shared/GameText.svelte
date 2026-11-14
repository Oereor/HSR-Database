<script lang="ts">
  import { groupGameTextRuby, parseGameText } from '$lib/domain/game-text';
  import InlineGameTextToken from '$lib/components/shared/InlineGameTextToken.svelte';
  import GameTextRuby from '$lib/components/shared/GameTextRuby.svelte';

  export let text = '';

  $: groups = groupGameTextRuby(parseGameText(text));
</script>

<span class="game-text">
  {#each groups as group}
    {#if 'ruby' in group}<GameTextRuby annotation={group.ruby.annotation}
        >{#each group.tokens as token}<InlineGameTextToken {token} />{/each}</GameTextRuby
      >{:else}<InlineGameTextToken token={group.token} />{/if}
  {/each}
</span>
