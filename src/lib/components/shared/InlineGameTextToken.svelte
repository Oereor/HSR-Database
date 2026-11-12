<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import type { InlineGameTextIcon } from '$lib/domain/types';

  export let token: {
    value: string;
    type?: 'text' | 'scaling-value' | 'fixed-param' | 'icon' | 'interaction';
    icon?: InlineGameTextIcon;
    color?: string;
    italic?: boolean;
    underline?: boolean;
    unbreak?: boolean;
  };
  export let characterAccent: string | undefined = undefined;
  $: resolvedColor =
    token.color ??
    (token.type === 'fixed-param' && characterAccent ? 'var(--character-accent)' : undefined);
  export let iconUrl: string | undefined = undefined;
</script>

{#if token.icon}<span
    class="game-text-inline-icon"
    class:game-text__unbreak={token.unbreak}
    data-game-icon={token.icon.spriteName}
    data-game-icon-id={token.icon.id}
    style:color={resolvedColor}
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
    style:color={resolvedColor}><em>{token.value}</em></u
  >{:else if token.underline}<u
    class:description-token--unbreak={token.unbreak}
    class:scaling-value={token.type === 'scaling-value'}
    data-game-color={token.color}
    style:color={resolvedColor}>{token.value}</u
  >{:else if token.italic}<em
    class:description-token--unbreak={token.unbreak}
    class:scaling-value={token.type === 'scaling-value'}
    data-game-color={token.color}
    style:color={resolvedColor}>{token.value}</em
  >{:else}<span
    class:description-token--unbreak={token.unbreak}
    class:scaling-value={token.type === 'scaling-value'}
    data-game-color={token.color}
    style:color={resolvedColor}>{token.value}</span
  >{/if}
