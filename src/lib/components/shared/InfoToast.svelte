<script context="module" lang="ts">
  export interface InfoToastNotice {
    id: number;
    title: string;
    message: string;
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';

  export let notice: InfoToastNotice | undefined = undefined;

  let mounted = false;
  let current: InfoToastNotice | undefined;
  let fading = false;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let removalTimer: ReturnType<typeof setTimeout> | undefined;

  function clearTimers(): void {
    clearTimeout(expiryTimer);
    clearTimeout(removalTimer);
  }

  function show(next: InfoToastNotice | undefined): void {
    clearTimers();
    current = next;
    fading = false;
    if (!next) return;
    const id = next.id;
    expiryTimer = setTimeout(() => {
      if (current?.id !== id) return;
      fading = true;
      const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 120;
      removalTimer = setTimeout(() => {
        if (current?.id === id) current = undefined;
      }, duration);
    }, 4000);
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  onMount(() => {
    mounted = true;
    return () => clearTimers();
  });

  $: if (mounted) show(notice);
</script>

<div
  class="info-toast-region"
  data-info-toast-region
  role="status"
  aria-live="polite"
  aria-atomic="true"
  use:portal
>
  {#if current}
    {#key current.id}
      <div class="info-toast" class:fading data-info-toast={current.id}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7v1" stroke-width="2" />
        </svg>
        <div class="info-toast__content">
          <strong>{current.title}</strong>
          <p>{current.message}</p>
        </div>
      </div>
    {/key}
  {/if}
</div>

<style>
  .info-toast-region {
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + var(--space-6));
    left: 50%;
    transform: translateX(-50%);
    width: calc(100% - 2 * var(--space-4));
    max-width: 26rem;
    z-index: 60;
    pointer-events: none;
  }
  .info-toast {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-2);
    box-shadow: 0 6px 20px rgb(0 0 0 / 22%);
    animation: toast-enter 160ms ease-out;
  }
  .info-toast svg {
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
    color: var(--muted);
  }
  .info-toast__content {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .info-toast p {
    margin: var(--space-1) 0 0;
    color: var(--muted);
    font-size: 0.875rem;
  }
  .info-toast.fading {
    animation: none;
    opacity: 0;
    transition: opacity 120ms ease-out;
  }
  @keyframes toast-enter {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .info-toast,
    .info-toast.fading {
      animation: none;
      transition: none;
    }
  }
</style>
