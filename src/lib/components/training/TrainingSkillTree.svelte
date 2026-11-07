<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import { getCharacterDetailIconUrl, getPathIconUrl } from '$lib/data/visual-assets';
  import { gameTextToPlain } from '$lib/domain/game-text';
  import {
    isToggleableTrainingNode,
    resolveTrainingSkillTree
  } from '$lib/domain/training/skill-tree';
  import type { CharacterTrainingProfile } from '$lib/domain/training/types';
  import type { CharacterProfile, SkillCard } from '$lib/domain/types';
  import { m } from '$lib/paraglide/messages.js';

  export let path: string;
  export let profile: CharacterTrainingProfile;
  export let presentation: CharacterProfile;
  export let accent: string;
  export let activeTraceIds: readonly string[];
  export let onToggle: (pointId: string) => void;

  $: layout = resolveLayout(path, profile);
  $: active = new Set(activeTraceIds);
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
  <div
    class="skill-tree"
    role="group"
    aria-label={m.training_skill_tree()}
    data-training-tree={layout.slug}
    data-training-profile={profile.enhancedId}
    style:--tree-accent={accent}
    style:--tree-crop={layout.cropRatio}
  >
    <AssetImage src={getPathIconUrl(path, 'large')} decorative class="tree-path" />
    {#each layout.nodes as { anchorType, center: [x, y], radius, kind, node } (node.pointId)}
      {@const label =
        traceLabels.get(node.pointId) ||
        skillLabels.get(node.pointId) ||
        `${m.training_skill_tree()} ${node.pointId}`}
      {@const source = getCharacterDetailIconUrl(node.iconKey)}
      {@const position = `--x:${50 + (50 * x) / layout.halfSize}%;--y:${50 + (50 * y) / layout.halfSize}%;--size:${(100 * radius) / layout.halfSize}%`}
      {#if isToggleableTrainingNode(node)}
        <button
          type="button"
          class="tree-node"
          class:tree-node--trace={kind !== 'skill'}
          aria-label={label}
          aria-pressed={active.has(node.pointId)}
          title={label}
          data-point-id={node.pointId}
          data-anchor={anchorType}
          style={position}
          on:click={() => onToggle(node.pointId)}>{@render icon(source)}</button
        >
      {:else}
        <span
          class="tree-node"
          class:tree-node--trace={kind !== 'skill'}
          role="img"
          aria-label={label}
          title={label}
          data-point-id={node.pointId}
          data-anchor={anchorType}
          style={position}>{@render icon(source)}</span
        >
      {/if}
    {/each}
  </div>
{:else}
  <p class="data-placeholder" role="status" data-training-tree-error>
    {m.training_skill_tree_unavailable()}
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

  button.tree-node {
    cursor: pointer;
  }

  .tree-node[aria-pressed='true'] {
    background: #fff;
    color: #000;
    box-shadow: 0 0 0 2px var(--tree-accent);
  }

  button.tree-node:focus-visible {
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

  .tree-node[aria-pressed='true'] > :global(.tree-icon) {
    filter: brightness(0);
  }

  .tree-node > :global(.tree-fallback) {
    color: inherit;
    font-size: clamp(0.55rem, 3cqw, 0.85rem);
  }
</style>
