<script lang="ts">
  export let characterAccent: string | undefined = undefined;
  import * as Dialog from '$lib/components/ui/dialog';
  import { Badge } from '$lib/components/ui/badge';
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import { getCharacterIconUrl } from '$lib/data/visual-assets';
  import { afterNavigate } from '$app/navigation';
  import SkillVariantView from '$lib/components/character/SkillVariantView.svelte';
  import SpecialEffectRelation from '$lib/components/character/SpecialEffectRelation.svelte';
  import type { CatalogEntry, CharacterSpecialEffectEntry } from '$lib/domain/types';
  import * as m from '$lib/paraglide/messages.js';
  import type { Locale } from '$lib/paraglide/runtime.js';

  export let open = false;
  export let entries: CharacterSpecialEffectEntry[] = [];
  export let targets: CatalogEntry[] = [];
  export let ownerCharacterId: string;
  export let trailblazerPreference:
    import('$lib/domain/trailblazer').TrailblazerGender | undefined = undefined;
  export let locale: Locale;
  export let selectedLevel: number;
  export let mode: 'skill' | 'series' = 'skill';
  export let onRequestClose: () => void = () => undefined;
  export let onClosed: () => void = () => undefined;

  const titleByOwner: Partial<Record<string, typeof m.special_effect_title>> = {
    '1415': m.special_effect_title_cyrene,
    '1510': m.special_effect_title_himeko,
    '1511': m.special_effect_title_aha
  };
  $: title = (titleByOwner[ownerCharacterId] ?? m.special_effect_title)({}, { locale });

  function changeOpen(next: boolean) {
    if (!next && open) onRequestClose();
  }
  afterNavigate(() => {
    if (open) onRequestClose();
  });
</script>

<Dialog.Root {open} onOpenChange={changeOpen}>
  <Dialog.Content
    aria-describedby={undefined}
    class="special-effect-dialog max-w-[56rem]"
    onCloseAutoFocus={(event) => {
      event.preventDefault();
      onClosed();
    }}
  >
    <Dialog.Header>
      <div class="flex min-w-0 items-center gap-3">
        <AssetImage
          src={getCharacterIconUrl(ownerCharacterId)}
          alt=""
          class="size-10 shrink-0 rounded-md object-cover"
          fallbackClass="size-10 shrink-0 rounded-md"
        />
        <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <Dialog.Title id="special-effect-dialog-title">{title}</Dialog.Title>
          <Badge variant="outline" class="special-effect-dialog__level text-muted-foreground">
            {mode === 'series'
              ? selectedLevel === 2
                ? m.series_skill_e2({}, { locale })
                : m.series_skill_e0({}, { locale })
              : `Lv.${selectedLevel}`}
          </Badge>
        </div>
      </div>
      <Dialog.Close
        label={m.special_effect_close({}, { locale })}
        class="special-effect-dialog__close"
      />
    </Dialog.Header>
    <Dialog.Body class="special-effect-dialog__content">
      {#if open}
        <div class="grid gap-5 sm:gap-6">
          {#each entries as entry (entry.skill.id)}
            <SkillVariantView
              variant={entry.skill}
              {selectedLevel}
              {characterAccent}
              compactHeading
            >
              <svelte:fragment slot="prefix"
                ><SpecialEffectRelation
                  {entry}
                  {targets}
                  {trailblazerPreference}
                /></svelte:fragment
              >
            </SkillVariantView>
          {/each}
        </div>
      {/if}
    </Dialog.Body>
  </Dialog.Content>
</Dialog.Root>
