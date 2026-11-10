<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import { m } from '$lib/paraglide/messages.js';
  export let eyebrow: string = m.overview_eyebrow();
  export let title: string = m.characters_title();
  export let description: string = m.characters_description();
  export let countLabel = '';
  export let artwork: Array<{ id: string; url: string }> = [];
</script>

<header
  class="overview-hero border-border relative isolate mb-6 grid min-h-40 items-center overflow-hidden border-b sm:min-h-44"
>
  <div class="overview-hero__copy relative z-10 max-w-xl py-6 sm:py-8">
    <p class="text-primary mb-2 text-xs font-semibold tracking-widest uppercase">{eyebrow}</p>
    <h1
      class="text-foreground m-0 text-[clamp(1.75rem,4vw,2.5rem)] leading-tight font-semibold tracking-tight wrap-anywhere"
    >
      {title}
    </h1>
    <p
      class="overview-hero__description text-muted-foreground mt-2 mb-0 max-w-[min(75%,28rem)] text-sm leading-relaxed sm:max-w-md"
    >
      {description}
    </p>
    {#if countLabel}<span
        class="overview-hero__count text-primary mt-3 inline-block text-sm font-medium"
        >{countLabel}</span
      >{/if}
  </div>
  {#if artwork.length || $$slots.artwork}
    <div
      class="overview-hero__artwork pointer-events-none absolute inset-y-0 right-0 w-[56%] mask-[linear-gradient(90deg,transparent,black_34%,black_78%,transparent)] opacity-40 sm:w-[52%] sm:max-w-2xl sm:opacity-60"
      aria-hidden="true"
    >
      {#if $$slots.artwork}<slot name="artwork" />{:else}
        {#each artwork as item, index (item.id)}
          <AssetImage
            decorative
            src={item.url}
            alt=""
            class={`overview-hero__character overview-hero__character--${index + 1} absolute -bottom-4 h-44 w-3/5 object-contain object-bottom saturate-[.82] sm:h-52 sm:w-[45%] sm:max-w-60 ${index === 0 ? 'right-[30%] opacity-60 sm:right-[40%]' : index === 1 ? 'right-0 opacity-80 sm:right-[17%]' : '-right-[2%] hidden opacity-50 sm:block'}`}
            loading="lazy"
            decoding="async"
          />
        {/each}
      {/if}
    </div>
  {/if}
</header>
