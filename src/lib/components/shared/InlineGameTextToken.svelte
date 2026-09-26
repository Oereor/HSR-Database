<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import type { InlineGameTextIcon } from '$lib/domain/types';

  export let token: {
    value: string;
    type?: 'text' | 'scaling-value' | 'icon';
    icon?: InlineGameTextIcon;
    color?: string;
    italic?: boolean;
    underline?: boolean;
    unbreak?: boolean;
  };
  export let iconUrl: string | undefined = undefined;
</script>

{#if token.icon}<span
    class="game-text-inline-icon"
    class:game-text__unbreak={token.unbreak}
    data-game-icon={token.icon.spriteName}
    data-game-icon-id={token.icon.id}
    style:color={token.color}
    aria-hidden="true"
    ><AssetImage
      src={iconUrl}
      alt=""
      width="24"
      height="24"
      decoding="async"
      fallbackClass="game-text-inline-icon__fallback"
    /></span
  >{:else if token.underline && token.italic}<u
    class:description-token--unbreak={token.unbreak}
    class:scaling-value={token.type === 'scaling-value'}
    data-game-color={token.color}
    style:color={token.color}><em>{token.value}</em></u
  >{:else if token.underline}<u
    class:description-token--unbreak={token.unbreak}
    class:scaling-value={token.type === 'scaling-value'}
    data-game-color={token.color}
    style:color={token.color}>{token.value}</u
  >{:else if token.italic}<em
    class:description-token--unbreak={token.unbreak}
    class:scaling-value={token.type === 'scaling-value'}
    data-game-color={token.color}
    style:color={token.color}>{token.value}</em
  >{:else}<span
    class:description-token--unbreak={token.unbreak}
    class:scaling-value={token.type === 'scaling-value'}
    data-game-color={token.color}
    style:color={token.color}>{token.value}</span
  >{/if}
