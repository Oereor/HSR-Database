<script lang="ts">
  import { onMount } from 'svelte';

  export let label: string;
  export let expandOnWideScreens = false;

  let open = false;
  let wide = false;
  let narrowOpen = false;

  onMount(() => {
    if (!expandOnWideScreens) return;
    const media = window.matchMedia('(max-width: 820px)');
    const syncViewport = () => {
      wide = !media.matches;
      open = wide || narrowOpen;
    };
    syncViewport();
    media.addEventListener('change', syncViewport);
    return () => media.removeEventListener('change', syncViewport);
  });

  function handleToggle(event: Event & { currentTarget: HTMLDetailsElement }) {
    if (wide) {
      open = true;
    } else {
      open = event.currentTarget.open;
      narrowOpen = open;
    }
  }
</script>

<details
  {...$$restProps}
  class="disclosure"
  class:disclosure--static={wide}
  {open}
  on:toggle={handleToggle}
>
  <summary>{label}</summary>
  <slot />
</details>

<style>
  .disclosure {
    min-width: 0;
    margin-top: var(--space-3);
    border-top: 1px solid var(--border);
    padding-top: var(--space-3);
    color: var(--text-secondary);
    font-size: var(--font-helper);
  }

  summary {
    width: fit-content;
    color: var(--text-body);
    cursor: pointer;
    font-weight: 400;
  }

  summary:hover {
    color: var(--text-primary);
  }

  summary:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 3px;
  }

  .disclosure--static {
    margin-top: var(--space-4);
    padding-top: 0;
  }

  .disclosure--static > summary {
    display: none;
  }
</style>
