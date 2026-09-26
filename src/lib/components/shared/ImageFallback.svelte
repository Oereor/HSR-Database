<script lang="ts">
  export let label = '';
  let className = '';
  export { className as class };
</script>

<span
  class={`image-fallback ${className}`}
  data-image-fallback
  role={label ? 'img' : undefined}
  aria-label={label || undefined}
  aria-hidden={label ? undefined : true}>?</span
>

<style>
  .image-fallback {
    display: inline-grid;
    place-items: center;
    flex: 0 0 auto;
    color: var(--text-muted, currentColor);
    font-family: var(--font-sans, sans-serif);
    font-size: var(--image-fallback-font-size, 1em);
    font-weight: 600;
    line-height: 1;
    text-align: center;
  }
</style>
