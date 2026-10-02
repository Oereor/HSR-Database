<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  // Svelte uses this interface to type forwarded HTML attributes.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface $$Props extends Omit<HTMLAttributes<HTMLDListElement>, 'class'> {
    class?: string;
    ariaLabel?: string;
    hasIcons?: boolean;
    spacing?: 'section' | 'flush';
  }

  export let ariaLabel: string | undefined = undefined;
  export let hasIcons = false;
  export let spacing: 'section' | 'flush' = 'section';
  let className = '';
  export { className as class };
</script>

<dl
  {...$$restProps}
  class={`inspection-stat-list hero-stat-list ${className}`.trim()}
  class:hero-stat-list--flush={spacing === 'flush'}
  aria-label={ariaLabel ?? $$restProps['aria-label']}
  style:--stat-label-columns={hasIcons ? '20px minmax(0, 1fr)' : 'minmax(0, 1fr)'}
  style:--stat-label-gap={hasIcons ? 'var(--space-2)' : '0px'}
  style:--stat-divider-inset={hasIcons ? 'calc(20px + var(--space-2))' : '0px'}
>
  <slot />
</dl>

<style>
  .hero-stat-list {
    min-width: 0;
    margin: var(--space-6) 0 0;
    border: 0;
    padding: 0;
  }

  .hero-stat-list--flush {
    margin-top: 0;
  }
</style>
