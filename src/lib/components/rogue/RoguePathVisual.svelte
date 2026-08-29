<script lang="ts">
  import SemanticIconLabel from '$lib/components/SemanticIconLabel.svelte';
  import type { RoguePath } from '$lib/domain/rogue';

  export let main: RoguePath;
  export let sub: RoguePath | undefined = undefined;
</script>

<div class="rogue-path-visual" class:rogue-path-visual--dual={sub} data-rogue-path-visual>
  <div class="rogue-path-visual__main" title={`主命途：${main.name}`}>
    <SemanticIconLabel
      kind="path"
      code={main.code}
      label={`主命途：${main.name}`}
      showLabel={false}
      fallbackMark={main.name.slice(0, 1)}
    />
    <span>{main.name}</span>
  </div>
  {#if sub}<div class="rogue-path-visual__sub" title={`副命途：${sub.name}`}>
      <SemanticIconLabel
        kind="path"
        code={sub.code}
        label={`副命途：${sub.name}`}
        showLabel={false}
        fallbackMark={sub.name.slice(0, 1)}
      />
      <span>{sub.name}</span>
    </div>{/if}
</div>

<style>
  .rogue-path-visual {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
  }
  .rogue-path-visual__main,
  .rogue-path-visual__sub {
    display: grid;
    min-width: 0;
    justify-items: center;
    gap: 0.5rem;
    color: var(--rogue-accent);
  }
  .rogue-path-visual__main {
    --semantic-icon-image-size: 5.2rem;
  }
  .rogue-path-visual__sub {
    --semantic-icon-image-size: 3rem;
    align-self: end;
    padding-bottom: 0.9rem;
    color: color-mix(in srgb, var(--rogue-accent) 76%, var(--text-secondary));
  }
  .rogue-path-visual span {
    max-width: 5.4rem;
    overflow: hidden;
    color: var(--text-secondary);
    font-size: var(--font-internal);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (max-width: 520px) {
    .rogue-path-visual {
      gap: 0.25rem;
    }
    .rogue-path-visual__main {
      --semantic-icon-image-size: 3.5rem;
    }
    .rogue-path-visual__sub {
      --semantic-icon-image-size: 2.05rem;
      padding-bottom: 0.7rem;
    }
    .rogue-path-visual span {
      max-width: 3.75rem;
      font-size: 0.65rem;
    }
  }
</style>
