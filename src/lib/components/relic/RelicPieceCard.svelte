<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import GameText from '$lib/components/shared/GameText.svelte';
  import RelicIcon from './RelicIcon.svelte';
  import { getRelicPieceIconUrl } from '$lib/data/visual-assets';
  import { relicSlotLabel } from '$lib/i18n/product';
  import { m } from '$lib/paraglide/messages.js';
  import type { RelicSet } from '$lib/domain/types';
  export let piece: RelicSet['pieces'][number];
</script>

<Card.Root
  size="sm"
  role="article"
  class="relic-piece-card h-full"
  data-relic-piece-id={piece.id}
  data-relic-slot={piece.slot}
>
  <Card.Header class="grid-cols-[4rem_minmax(0,1fr)] items-start gap-3">
    <RelicIcon source={getRelicPieceIconUrl(piece.id)} alt={piece.name} presentation="piece" />
    <div class="grid min-w-0 gap-2">
      <Card.Title><GameText text={piece.name} /></Card.Title>
      <Badge class="relic-piece-card__slot max-w-full whitespace-normal"
        >{relicSlotLabel(piece.slot) || m.relic_piece_type_unavailable()}</Badge
      >
    </div>
  </Card.Header>
  <Card.Content
    ><p
      class="text-secondary-foreground m-0 text-sm leading-relaxed wrap-anywhere"
      class:text-muted-foreground={!piece.description}
    >
      <GameText text={piece.description || m.relic_piece_description_unavailable()} />
    </p></Card.Content
  >
</Card.Root>
