<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  export let src: string | undefined = undefined;
  export let event = false;
  let missing = !src;
</script>

{#if src}<AssetImage {src} alt="" decorative bind:missing />{/if}
{#if !src || missing}
  <svg
    class="participant-icon"
    data-testid="participant-icon-fallback"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    aria-hidden="true"
  >
    {#if event}<circle cx="12" cy="13" r="8" /><path
        d="M12 9v4l3 2M9 2h6M12 2v3M18 5l2 2"
      />{:else}<circle cx="12" cy="8" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3" />{/if}
  </svg>
{/if}

<style>
  .participant-icon {
    width: 65%;
    height: 65%;
    color: var(--text-secondary);
  }
</style>
