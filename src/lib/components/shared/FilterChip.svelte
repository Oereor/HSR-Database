<script lang="ts">
  import { getElementColor } from '$lib/domain/elements';
  import { getElementIconUrl, getPathIconUrl } from '$lib/data/visual-assets';

  export let label: string;
  export let value: string;
  export let iconKind: 'path' | 'element' | undefined = undefined;
  export let selected = false;

  $: icon =
    iconKind === 'path'
      ? getPathIconUrl(value)
      : iconKind === 'element'
        ? getElementIconUrl(value)
        : undefined;
  $: color = iconKind === 'element' ? getElementColor(value) : undefined;
</script>

<button
  type="button"
  class="filter-chip"
  class:filter-chip--selected={selected}
  aria-pressed={selected}
  style:color
  on:click
>
  {#if icon}<img src={icon} alt="" aria-hidden="true" width="18" height="18" />{/if}
  <span>{label}</span>
</button>

<style>
  .filter-chip {
    display: inline-flex;
    min-height: 2.1rem;
    align-items: center;
    gap: 0.42rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: rgb(255 255 255 / 3%);
    padding: 0.36rem 0.72rem;
    color: var(--text-secondary);
    font-size: var(--font-helper);
    font-weight: 650;
    line-height: 1.1;
    transition:
      border-color var(--motion),
      background var(--motion),
      color var(--motion),
      transform var(--motion);
  }

  .filter-chip img {
    width: 1.1rem;
    height: 1.1rem;
    object-fit: contain;
  }

  .filter-chip:hover {
    border-color: var(--border-strong);
    background: var(--surface-2);
    color: var(--text-primary);
    transform: translateY(-1px);
  }

  .filter-chip--selected {
    border-color: var(--gold);
    background: rgb(215 181 109 / 12%);
    color: var(--text-primary);
    box-shadow: inset 0 0 0 1px rgb(215 181 109 / 15%);
  }

  @media (prefers-reduced-motion: reduce) {
    .filter-chip {
      transition: none;
    }
  }
</style>
