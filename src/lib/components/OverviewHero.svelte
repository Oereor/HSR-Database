<script lang="ts">
  export let eyebrow = 'DATABASE';
  export let title = '角色';
  export let description = '浏览、搜索并筛选角色资料。';
  export let countLabel = '';
  export let artwork: Array<{ id: string; url: string }> = [];
</script>

<header class="overview-hero">
  <div class="overview-hero__copy">
    <p class="kicker">{eyebrow}</p>
    <h1>{title}</h1>
    <p class="overview-hero__description">{description}</p>
    <span class="overview-hero__count">{countLabel}</span>
  </div>
  {#if artwork.length || $$slots.artwork}
    <div class="overview-hero__artwork" aria-hidden="true">
      {#if $$slots.artwork}
        <slot name="artwork" />
      {:else}
        {#each artwork as item, index (item.id)}
          <img
            src={item.url}
            alt=""
            class={`overview-hero__character overview-hero__character--${index + 1}`}
            loading="lazy"
            decoding="async"
          />
        {/each}
      {/if}
    </div>
  {/if}
</header>

<style>
  .overview-hero {
    position: relative;
    min-height: 188px;
    display: grid;
    align-items: center;
    overflow: hidden;
    margin-bottom: clamp(1.75rem, 4vw, 3rem);
    border-bottom: 1px solid var(--border);
    isolation: isolate;
  }

  .overview-hero__copy {
    position: relative;
    z-index: 2;
    max-width: 34rem;
    padding: 1.5rem 0;
  }

  .overview-hero h1 {
    margin: 0 0 0.35rem;
    font-size: clamp(2.1rem, 5vw, 3.25rem);
    line-height: 1.05;
  }

  .overview-hero__description {
    max-width: 28rem;
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--font-body);
  }

  .overview-hero__count {
    display: inline-block;
    margin-top: 0.9rem;
    color: var(--gold-soft);
    font-size: var(--font-helper);
    font-weight: 700;
  }

  .overview-hero__artwork {
    position: absolute;
    z-index: 1;
    inset: 0 0 0 auto;
    width: min(52%, 42rem);
    pointer-events: none;
    opacity: 0.68;
    mask-image: linear-gradient(90deg, transparent 0%, black 34%, black 78%, transparent 100%);
  }

  .overview-hero__artwork::after {
    position: absolute;
    inset: 0;
    content: '';
    background: linear-gradient(90deg, var(--bg) 0%, transparent 36%, rgb(7 10 18 / 20%) 100%);
  }

  .overview-hero__character {
    position: absolute;
    bottom: -1.2rem;
    width: 45%;
    max-width: 15rem;
    height: 14rem;
    object-fit: contain;
    object-position: center bottom;
    filter: saturate(0.82);
  }

  .overview-hero__character--1 {
    right: 40%;
    opacity: 0.62;
  }

  .overview-hero__character--2 {
    right: 17%;
    opacity: 0.82;
  }

  .overview-hero__character--3 {
    right: -2%;
    opacity: 0.48;
  }

  @media (max-width: 700px) {
    .overview-hero {
      min-height: 156px;
      margin-bottom: 1.75rem;
    }

    .overview-hero__copy {
      padding: 1.25rem 0;
    }

    .overview-hero__description {
      max-width: 17rem;
      font-size: var(--font-helper);
    }

    .overview-hero__artwork {
      width: 56%;
      opacity: 0.48;
    }

    .overview-hero__character {
      width: 60%;
      height: 11rem;
    }

    .overview-hero__character--1 {
      right: 30%;
    }

    .overview-hero__character--2 {
      right: 0;
    }

    .overview-hero__character--3 {
      display: none;
    }
  }
</style>
