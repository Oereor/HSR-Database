<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Tooltip as TooltipPrimitive } from 'bits-ui';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { traceRequirementText } from '$lib/components/character/trace-requirements';
  import { getCharacterDetailIconUrl, getPathIconUrl } from '$lib/data/visual-assets';
  import { gameTextToPlain } from '$lib/domain/game-text';
  import {
    isToggleableTrainingNode,
    resolveTrainingSkillTree
  } from '$lib/domain/training/skill-tree';
  import { skillTreeLineStyle } from '$lib/domain/training/skill-tree-connections';
  import { skillTreeViewBox } from '$lib/domain/training/skill-tree-layout';
  import type { CharacterTrainingProfile } from '$lib/domain/training/types';
  import type { CharacterProfile, SkillCard } from '$lib/domain/types';
  import { m } from '$lib/paraglide/messages.js';
  import { resolvePlayerTraceState } from '$lib/player/character';

  export let path: string;
  export let profile: CharacterTrainingProfile;
  export let presentation: CharacterProfile;
  export let accent: string;
  export let state:
    | {
        mode: 'interactive';
        activeTraceIds: readonly string[];
        onToggle: (pointId: string) => void;
      }
    | { mode: 'readonly'; playerIndex: ReadonlyMap<string, number> };

  const tooltip = TooltipPrimitive.createTether<{ label: string; description?: string }>();

  $: layout = resolveLayout(path, profile);
  $: active = new Set(state.mode === 'interactive' ? state.activeTraceIds : []);
  $: treeLabel = state.mode === 'readonly' ? m.player_trace_tree() : m.training_skill_tree();
  $: traceLabels = new Map(
    presentation.traces.map((trace) => [trace.id, gameTextToPlain(trace.name || trace.description)])
  );
  $: skillLabels = getSkillLabels(presentation.skillCards);

  function getSkillLabels(cards: SkillCard[]) {
    const labels = new Map<string, string>();
    for (const card of cards) {
      for (const { id } of card.progressions) {
        const label = labels.get(id);
        labels.set(id, label ? `${label} / ${card.displayLabel}` : card.displayLabel);
      }
    }
    return labels;
  }

  function resolveLayout(path: string, profile: CharacterTrainingProfile) {
    try {
      return resolveTrainingSkillTree(path, profile);
    } catch (error) {
      console.error(error);
      return undefined;
    }
  }
</script>

{#snippet icon(src: string | undefined)}
  <AssetImage {src} alt="" aria-hidden="true" class="tree-icon" fallbackClass="tree-fallback" />
{/snippet}

{#if layout}
  <Tooltip.Root tether={tooltip}>
    {#snippet children({ payload })}
      <div
        class="skill-tree"
        role="group"
        aria-label={treeLabel}
        data-skill-tree-mode={state.mode}
        data-training-tree={layout.slug}
        data-training-profile={profile.enhancedId}
        style:--tree-accent={accent}
        style:--tree-crop={layout.cropRatio}
      >
        <AssetImage src={getPathIconUrl(path, 'large')} decorative class="tree-path" />
        <svg
          class="tree-connections"
          viewBox={skillTreeViewBox(layout.halfSize)}
          aria-hidden="true"
          focusable="false"
          fill="none"
        >
          <g
            stroke={skillTreeLineStyle.stroke}
            opacity={skillTreeLineStyle.opacity}
            stroke-width={skillTreeLineStyle.width * layout.referenceRadius}
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            {#each layout.connections as d (d)}
              <path {d} />
            {/each}
          </g>
        </svg>
        {#each layout.nodes as { anchorType, center: [x, y], radius, kind, node } (node.pointId)}
          {@const label =
            traceLabels.get(node.pointId) ||
            skillLabels.get(node.pointId) ||
            `${treeLabel} ${node.pointId}`}
          {@const source = getCharacterDetailIconUrl(node.iconKey)}
          {@const position = `--x:${50 + (50 * x) / layout.halfSize}%;--y:${50 + (50 * y) / layout.halfSize}%;--size:${(100 * radius) / layout.halfSize}%`}
          {@const step = kind !== 'skill' ? node.steps[0] : undefined}
          {@const requirements = step
            ? traceRequirementText(step.requiredPromotion, step.requiredCharacterLevel)
            : undefined}
          {@const description = requirements
            ? `${m.trace_unlock_condition()} ${requirements}`
            : undefined}
          {@const descriptionId = `training-trace-${profile.avatarId}-${profile.enhancedId}-${node.pointId}-requirements`}
          {@const traceState =
            state.mode === 'readonly' && kind !== 'skill'
              ? resolvePlayerTraceState(node.pointId, state.playerIndex)
              : undefined}
          {@const stateLabel =
            traceState === 'active' ? m.player_character_active() : m.player_character_inactive()}
          {@const nodeLabel = traceState ? `${label} · ${stateLabel}` : label}
          <Tooltip.Trigger tether={tooltip} payload={{ label: nodeLabel, description }}>
            {#snippet child({ props })}
              {@const buttonProps = props as HTMLButtonAttributes}
              {#if state.mode === 'interactive' && isToggleableTrainingNode(node)}
                <button
                  {...buttonProps}
                  type="button"
                  class="tree-node"
                  class:tree-node--trace={kind !== 'skill'}
                  aria-label={label}
                  aria-describedby={buttonProps['aria-describedby'] ??
                    (description ? descriptionId : undefined)}
                  aria-pressed={active.has(node.pointId)}
                  data-point-id={node.pointId}
                  data-anchor={anchorType}
                  style={position}
                  onclick={(event) => {
                    buttonProps.onclick?.(event);
                    if (state.mode === 'interactive') state.onToggle(node.pointId);
                  }}>{@render icon(source)}</button
                >
              {:else}
                <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard access to trace tooltips) -->
                <span
                  {...{ ...props, type: undefined, disabled: undefined }}
                  class="tree-node"
                  class:tree-node--trace={kind !== 'skill'}
                  role="img"
                  tabindex="0"
                  aria-label={nodeLabel}
                  aria-describedby={buttonProps['aria-describedby'] ??
                    (description ? descriptionId : undefined)}
                  data-trace-state={traceState}
                  data-point-id={node.pointId}
                  data-anchor={anchorType}
                  style={position}>{@render icon(source)}</span
                >
              {/if}
            {/snippet}
          </Tooltip.Trigger>
          {#if description}<span id={descriptionId} class="sr-only">{description}</span>{/if}
        {/each}
      </div>
      <Tooltip.Content>
        {#if payload}
          <div class="grid gap-1">
            <span>{payload.label}</span>
            {#if payload.description}<span class="text-muted-foreground">{payload.description}</span
              >{/if}
          </div>
        {/if}
      </Tooltip.Content>
    {/snippet}
  </Tooltip.Root>
{:else}
  <p class="data-placeholder" role="status" data-training-tree-error>
    {state.mode === 'readonly'
      ? m.player_trace_tree_unavailable()
      : m.training_skill_tree_unavailable()}
  </p>
{/if}

<style>
  .skill-tree {
    position: relative;
    isolation: isolate;
    flex: none;
    width: calc(var(--tree-reference-width, min(100%, 39rem)) * var(--tree-crop));
    margin-inline: auto;
    aspect-ratio: 1;
    container-type: inline-size;
  }

  .skill-tree > :global(.tree-path),
  .tree-node {
    position: absolute;
    translate: -50% -50%;
  }

  .skill-tree > :global(.tree-path) {
    top: 50%;
    left: 50%;
    pointer-events: none;
    width: calc(64% / var(--tree-crop));
    aspect-ratio: 1;
    object-fit: contain;
    opacity: 0.08;
  }

  .tree-node {
    z-index: 1;
    top: var(--y);
    left: var(--x);
    display: grid;
    width: var(--size);
    aspect-ratio: 1;
    place-items: center;
    padding: 0;
    border-radius: 50%;
    background: #000;
    color: #fff;
  }

  .tree-connections {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  button.tree-node {
    cursor: pointer;
  }

  .tree-node:is([aria-pressed='true'], [data-trace-state='active']) {
    background: #fff;
    color: #000;
    box-shadow: 0 0 0 2px var(--tree-accent);
  }

  .tree-node:focus-visible {
    z-index: 2;
    outline: 2px solid #fff;
    outline-offset: 3px;
  }

  .tree-node > :global(.tree-icon) {
    width: 66%;
    height: 66%;
    object-fit: contain;
    filter: brightness(0) invert(1);
  }

  .tree-node--trace > :global(.tree-icon) {
    width: 84%;
    height: 84%;
  }

  .tree-node:is([aria-pressed='true'], [data-trace-state='active']) > :global(.tree-icon) {
    filter: brightness(0);
  }

  .tree-node > :global(.tree-fallback) {
    color: inherit;
    font-size: clamp(0.55rem, 3cqw, 0.85rem);
  }
</style>
