<script lang="ts">
  import DescriptionText from '$lib/components/shared/DescriptionText.svelte';
  import type { DiffSegment } from '$lib/domain/enhancement-text-diff';
  import type { Locale } from '$lib/paraglide/runtime.js';
  import { m } from '$lib/paraglide/messages.js';

  let { segments, locale }: { segments: DiffSegment[]; locale: Locale } = $props();
</script>

{#each segments as { operation, tokens }}{#if operation === 'equal' || !tokens.some((token) => token.value.trim() || token.icon)}<DescriptionText
      {tokens}
    />{:else if operation === 'delete'}<del class="removed" data-diff="delete"
      ><span class="sr-only"
        >{m.enhancement_comparison_deleted_text({}, { locale })}
      </span><DescriptionText {tokens} /></del
    >{:else}<ins class="added" data-diff="insert"
      ><span class="sr-only"
        >{m.enhancement_comparison_inserted_text({}, { locale })}
      </span><DescriptionText {tokens} /></ins
    >{/if}{/each}

<style>
  .removed,
  .added {
    border-radius: 0.18rem;
    padding-block: 0.035em;
    box-decoration-break: clone;
    text-decoration: none;
  }
  .removed {
    background: color-mix(in srgb, var(--destructive) 20%, transparent);
    box-shadow: inset 0 -1px color-mix(in srgb, var(--destructive) 85%, transparent);
  }
  .added {
    background: color-mix(in srgb, var(--color-emerald-400) 18%, transparent);
    box-shadow: inset 0 -1px color-mix(in srgb, var(--color-emerald-400) 80%, transparent);
  }
</style>
