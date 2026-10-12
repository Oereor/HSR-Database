<script lang="ts">
  import type { ParticipantLabels } from '$lib/action-planner/presentation';
  import { m } from '$lib/paraglide/messages.js';
  import type { Locale } from '$lib/paraglide/runtime.js';
  import type { EventAnchor, ParticipantInfo } from '$lib/action-planner/types';
  import { canUseVonwacq, type PresetKind } from '$lib/action-planner/presets';
  import CompactEntityCard from '$lib/components/shared/CompactEntityCard.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import { getLightConePreviewUrl, getRelicSetIconUrl } from '$lib/data/visual-assets';
  import TargetGrid from './TargetGrid.svelte';
  export let labels: ParticipantLabels = new Map();
  export let locale: Locale;
  export let anchor: EventAnchor;
  export let participants: ParticipantInfo[];
  export let avatar: (id: string) => string | undefined;
  export let presets: { vonwacq?: string; eagle?: string; dance?: string };
  export let selectedPreset: PresetKind | undefined;
  export let onSelect: (kind: PresetKind, target: string) => void;
  let presetTarget = '';
  $: units = participants;
  $: actorTargets = units.filter((unit) => unit.kind === 'actor');
  $: if (!actorTargets.some((unit) => unit.id === presetTarget))
    presetTarget = actorTargets[0]?.id ?? '';
  $: selectedPresetUnit = actorTargets.find((unit) => unit.id === presetTarget);
  $: vonwacqAvailable = canUseVonwacq(anchor);
  function choose(kind: PresetKind) {
    onSelect(kind, presetTarget);
  }
</script>

<details class="presets">
  <summary>{m.planner_presets({}, { locale })}</summary>
  <fieldset>
    <legend>{m.planner_target({}, { locale })}</legend>
    <TargetGrid
      participants={actorTargets}
      {labels}
      selectedIds={[presetTarget]}
      {avatar}
      testId="preset-target"
      onToggle={(id) => {
        presetTarget = id;
      }}
    />
  </fieldset>
  <div class="compact-entity-grid">
    <CompactEntityCard
      asButton
      wrapTitle
      selected={selectedPreset === 'vonwacq'}
      imageUrl={getRelicSetIconUrl('308')}
      data-testid="preset-vonwacq"
      disabled={!vonwacqAvailable || !selectedPresetUnit}
      on:click={() => choose('vonwacq')}
    >
      <svelte:fragment slot="title"
        ><GameText
          text={presets.vonwacq ?? m.planner_preset_fallback({ index: 1 }, { locale })}
        /></svelte:fragment
      >
      <svelte:fragment slot="secondary"
        >{m.planner_preset_vonwacq_effect({}, { locale })}</svelte:fragment
      >
    </CompactEntityCard>
    <CompactEntityCard
      asButton
      wrapTitle
      selected={selectedPreset === 'eagle'}
      imageUrl={getRelicSetIconUrl('110')}
      data-testid="preset-eagle"
      disabled={!selectedPresetUnit}
      on:click={() => choose('eagle')}
    >
      <svelte:fragment slot="title"
        ><GameText
          text={presets.eagle ?? m.planner_preset_fallback({ index: 2 }, { locale })}
        /></svelte:fragment
      >
      <svelte:fragment slot="secondary"
        >{m.planner_preset_eagle_effect({}, { locale })}</svelte:fragment
      >
    </CompactEntityCard>
    <CompactEntityCard
      asButton
      wrapTitle
      selected={selectedPreset === 'dance'}
      imageUrl={getLightConePreviewUrl('21018')}
      data-testid="preset-dance"
      disabled={!units.some((unit) => unit.kind === 'actor' && unit.camp === 'ally')}
      on:click={() => choose('dance')}
    >
      <svelte:fragment slot="title"
        ><GameText
          text={presets.dance ?? m.planner_preset_fallback({ index: 3 }, { locale })}
        /></svelte:fragment
      >
      <svelte:fragment slot="secondary"
        >{m.planner_preset_dance_effect({}, { locale })}</svelte:fragment
      >
    </CompactEntityCard>
  </div>
</details>

<style>
  .presets {
    margin-top: var(--space-4);
    border-top: 1px solid var(--border);
    padding-top: var(--space-3);
  }
  summary {
    cursor: pointer;
    color: var(--text-secondary);
    font-size: var(--font-helper);
  }
  summary:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
  fieldset {
    min-width: 0;
    padding: 0;
    border: 0;
    margin: var(--space-3) 0 0;
  }
  legend {
    color: var(--text-body);
    font-size: var(--font-helper);
    margin-bottom: var(--space-2);
  }
  .compact-entity-grid {
    margin-top: var(--space-3);
  }
</style>
