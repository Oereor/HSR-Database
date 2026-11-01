<script lang="ts">
  export let variant: 'default' | 'compact' | 'character' = 'default';
</script>

<div
  class="overview-grid grid min-w-0 grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))] sm:gap-4"
  class:overview-grid--compact={variant === 'compact'}
  class:overview-grid--character={variant === 'character'}
>
  <slot />
</div>
