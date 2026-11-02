<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import ImageFallback from '$lib/components/shared/ImageFallback.svelte';
  import { m } from '$lib/paraglide/messages.js';

  export let characterId: string;
</script>

<Card.Root
  size="sm"
  role="article"
  class="unknown-character h-full gap-0 overflow-hidden border-dashed py-0"
  aria-label={m.player_unknown_character()}
>
  <ImageFallback
    class="unknown-character__placeholder bg-muted/40 aspect-4/5 w-full [--image-fallback-font-size:2rem]"
  />
  <Card.Content class="p-3 group-data-[size=sm]/card:px-3">
    <h3 class="text-foreground m-0 text-sm leading-snug font-semibold wrap-anywhere">
      {m.player_unknown_character()}
    </h3>
    <p class="text-muted-foreground m-0 mt-1 text-xs leading-relaxed wrap-anywhere">
      {m.player_unknown_character_id({ id: characterId })}
    </p>
  </Card.Content>
</Card.Root>
