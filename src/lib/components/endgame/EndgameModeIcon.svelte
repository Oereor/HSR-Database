<script lang="ts">
  import { getEndgameModeIconUrl } from '$lib/data/visual-assets';
  import type { EndgameMode } from '$lib/domain/endgame';
  import { ENDGAME_MODE_META } from '$lib/domain/endgame-view';

  export let mode: EndgameMode;

  $: metadata = ENDGAME_MODE_META[mode];
  $: iconUrl = getEndgameModeIconUrl(metadata.iconKey);
</script>

{#if iconUrl}
  <span
    class="endgame-mode-icon"
    aria-hidden="true"
    style={`--endgame-mode-icon-url: url("${iconUrl}"); --endgame-mode-icon-color: ${metadata.accent};`}
  ></span>
{/if}

<style>
  .endgame-mode-icon {
    display: inline-block;
    width: 1em;
    height: 1em;
    flex: 0 0 auto;
    background: var(--endgame-mode-icon-color);
    mask: var(--endgame-mode-icon-url) center / contain no-repeat;
    -webkit-mask: var(--endgame-mode-icon-url) center / contain no-repeat;
    pointer-events: none;
  }
</style>
