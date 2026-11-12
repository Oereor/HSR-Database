<script lang="ts">
  export let characterAccent: string | undefined = undefined;
  import * as Dialog from '$lib/components/ui/dialog';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { afterNavigate } from '$app/navigation';
  import SkillVariantView from '$lib/components/character/SkillVariantView.svelte';
  import SpecialEffectRelation from '$lib/components/character/SpecialEffectRelation.svelte';
  import type { CatalogEntry, CharacterSpecialEffectEntry } from '$lib/domain/types';
  import * as m from '$lib/paraglide/messages.js';

  export let open = false;
  export let entries: CharacterSpecialEffectEntry[] = [];
  export let targets: CatalogEntry[] = [];
  export let ownerCharacterId: string;
  export let selectedLevel: number;
  export let mode: 'skill' | 'series' = 'skill';
  export let onRequestClose: () => void = () => undefined;
  export let onClosed: () => void = () => undefined;

  function changeOpen(next: boolean) {
    if (!next && open) onRequestClose();
  }
  afterNavigate(() => {
    if (open) onRequestClose();
  });
</script>

<Dialog.Root {open} onOpenChange={changeOpen}>
  <Dialog.Content
    showCloseButton={false}
    aria-describedby={undefined}
    class="special-effect-dialog flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
    onCloseAutoFocus={(event) => {
      event.preventDefault();
      onClosed();
    }}
  >
    <header
      class="border-border flex shrink-0 items-start justify-between gap-4 border-b p-4 sm:p-6"
    >
      <div>
        <p class="kicker">CHARACTER EFFECTS</p>
        <div class="flex items-center gap-3">
          <Dialog.Title id="special-effect-dialog-title" class="text-xl"
            >{m.special_effect_title()}</Dialog.Title
          >
          <Badge
            variant="outline"
            class="skill-effect-tag special-effect-dialog__level text-primary"
            >{mode === 'series'
              ? selectedLevel === 2
                ? m.series_skill_e2()
                : m.series_skill_e0()
              : `Lv.${selectedLevel}`}</Badge
          >
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        class="special-effect-dialog__close shrink-0"
        aria-label={m.special_effect_close()}
        onclick={onRequestClose}>×</Button
      >
    </header>
    <div
      class="special-effect-dialog__content min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6"
    >
      {#if open}
        <div class="skill-variant-list special-effect-entry-list">
          {#each entries as entry (entry.skill.id)}
            <SkillVariantView
              variant={entry.skill}
              {selectedLevel}
              {characterAccent}
              compactHeading
            >
              <svelte:fragment slot="prefix"
                ><SpecialEffectRelation {entry} {targets} {ownerCharacterId} /></svelte:fragment
              >
            </SkillVariantView>
          {/each}
        </div>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
