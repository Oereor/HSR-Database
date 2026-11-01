<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import GameText from '$lib/components/shared/GameText.svelte';
  import type { EndgameOrderedMechanicView } from '$lib/domain/endgame-view';

  export let option: EndgameOrderedMechanicView;
  export let headingLevel: 3 | 4 | 5 = 3;

  $: headingTag = `h${headingLevel}` as const;
</script>

<Card.Root size="sm" role="article" class="buff-option-tile h-full gap-2" data-buff-option-tile>
  <Card.Header>
    <svelte:element this={headingTag} class="m-0 text-lg leading-snug font-semibold wrap-anywhere"
      ><GameText text={option.name} /></svelte:element
    >
  </Card.Header>
  <Card.Content class="grid gap-2">
    <p class="text-secondary-foreground m-0 text-sm leading-relaxed wrap-anywhere">
      <GameText text={option.description} />
    </p>
    {#if option.simpleDescription}
      <p
        class="buff-option-tile__supplement text-muted-foreground m-0 text-xs leading-relaxed wrap-anywhere"
        data-buff-option-supplement
      >
        <GameText text={option.simpleDescription} />
      </p>
    {/if}
  </Card.Content>
</Card.Root>
