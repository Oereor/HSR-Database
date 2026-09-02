<script lang="ts">
  export let href: string;
  export let imageUrl: string | undefined = undefined;
  export let imageAlt = '';
  export let fallbackLabel: string;
  export let artworkFit: 'contain' | 'cover' | 'scale-down' = 'contain';
  export let artworkPosition = 'center bottom';
  export let artworkScale = 1;
  export let size: 'large' | 'compact' = 'large';
  export let density: 'default' | 'compact' = 'default';
  export let mediaPresentation: 'artwork' | 'icon' = 'artwork';

  let failedSource: string | undefined;
  $: visibleSource = imageUrl && imageUrl !== failedSource ? imageUrl : undefined;
  $: fallbackMark = fallbackLabel.trim().slice(0, 1) || '?';
</script>

<a
  class="entity-overview-card"
  class:entity-overview-card--missing={!visibleSource}
  class:entity-overview-card--compact={size === 'compact'}
  class:entity-overview-card--dense={density === 'compact'}
  class:entity-overview-card--icon-media={mediaPresentation === 'icon'}
  data-image-missing={!visibleSource}
  data-card-size={size}
  data-card-density={density}
  data-media-presentation={mediaPresentation}
  {href}
>
  <span class="entity-overview-card__artwork" aria-hidden={!imageAlt}>
    {#if visibleSource}
      <img
        src={visibleSource}
        alt={imageAlt}
        style:object-fit={artworkFit}
        style:object-position={artworkPosition}
        style:transform={`scale(${artworkScale})`}
        loading="lazy"
        decoding="async"
        on:error={() => (failedSource = visibleSource)}
      />
    {:else}
      <span class="entity-overview-card__fallback" aria-hidden="true">
        <span>{fallbackMark}</span>
      </span>
    {/if}
  </span>
  <span class="entity-overview-card__overlay"><slot name="overlay" /></span>
  <span
    class="entity-overview-card__content"
    class:entity-overview-card__content--title-only={!$$slots.metadata}
  >
    <h3 class="entity-overview-card__title"><slot name="title" /></h3>
    {#if $$slots.metadata}<span class="entity-overview-card__metadata"
        ><slot name="metadata" /></span
      >{/if}
  </span>
</a>

<style>
  .entity-overview-card {
    position: relative;
    display: grid;
    grid-template-rows: clamp(300px, 23vw, 336px) 128px;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: linear-gradient(155deg, rgb(255 255 255 / 4%), transparent 46%), var(--surface);
    isolation: isolate;
    transition:
      transform var(--motion),
      border-color var(--motion),
      box-shadow var(--motion),
      background var(--motion);
  }

  .entity-overview-card.entity-overview-card--compact {
    grid-template-rows: 176px auto;
  }

  .entity-overview-card.entity-overview-card--dense {
    grid-template-rows: 236px 122px;
  }

  .entity-overview-card:hover {
    transform: translateY(-2px);
    border-color: var(--border-strong);
    background: linear-gradient(155deg, rgb(255 255 255 / 6%), transparent 46%), var(--surface);
    box-shadow: 0 14px 34px rgb(0 0 0 / 24%);
  }

  .entity-overview-card__artwork {
    position: relative;
    z-index: 0;
    display: grid;
    width: 100%;
    height: 100%;
    min-width: 0;
    overflow: hidden;
    place-items: end center;
    border-bottom: 1px solid rgb(255 255 255 / 5%);
    background:
      radial-gradient(circle at 50% 78%, rgb(215 181 109 / 11%), transparent 48%),
      linear-gradient(180deg, rgb(255 255 255 / 2%), rgb(255 255 255 / 0%));
    pointer-events: none;
  }

  .entity-overview-card__artwork img {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    max-width: 100%;
    flex: 0 0 auto;
    transform-origin: center bottom;
  }

  .entity-overview-card--icon-media .entity-overview-card__artwork {
    place-items: center;
  }

  .entity-overview-card--icon-media .entity-overview-card__artwork img {
    width: calc(100% - 2 * var(--space-6));
    height: calc(100% - 2 * var(--space-6));
    max-width: 8rem;
    max-height: 8rem;
    margin: auto;
    transform-origin: center;
  }

  .entity-overview-card__overlay {
    position: absolute;
    z-index: 2;
    top: var(--space-3);
    right: var(--space-3);
    display: inline-flex;
    max-width: calc(100% - 2 * var(--space-3));
    min-height: 1.8rem;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 13%);
    border-radius: 999px;
    background: rgb(7 10 18 / 72%);
    padding: 0.38rem 0.68rem;
    color: var(--text-secondary);
    backdrop-filter: blur(8px);
    font-size: 0.76rem;
    font-weight: 650;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 6px 18px rgb(0 0 0 / 18%);
  }

  .entity-overview-card__content {
    position: relative;
    z-index: 1;
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-3) var(--space-4);
    text-align: center;
  }

  .entity-overview-card--compact .entity-overview-card__content {
    height: auto;
    padding: var(--space-4);
  }

  .entity-overview-card--dense .entity-overview-card__content {
    padding: var(--space-3) var(--space-3) var(--space-4);
  }

  .entity-overview-card--dense .entity-overview-card__metadata {
    min-height: 2.5rem;
    gap: 0.35rem;
  }

  .entity-overview-card__content--title-only {
    justify-content: center;
  }

  .entity-overview-card--compact
    .entity-overview-card__content--title-only
    .entity-overview-card__title {
    min-height: 0;
  }

  .entity-overview-card__title {
    display: -webkit-box;
    min-height: 2.6em;
    margin: 0;
    overflow: hidden;
    color: var(--text-primary);
    font-size: var(--font-card-title);
    font-weight: 750;
    line-height: 1.3;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .entity-overview-card__metadata {
    container: overview-metadata / inline-size;
    display: flex;
    width: 100%;
    min-width: 0;
    min-height: 2.35rem;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
  }

  .entity-overview-card__fallback {
    display: grid;
    width: 9rem;
    height: 9rem;
    margin-bottom: 3rem;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 50%;
    background:
      radial-gradient(circle at 50% 45%, rgb(215 181 109 / 18%), transparent 56%), var(--surface-2);
    color: var(--text-muted);
    font-size: 2rem;
    font-weight: 700;
  }

  .entity-overview-card--compact .entity-overview-card__fallback {
    width: 7rem;
    height: 7rem;
    margin-bottom: 0;
  }

  .entity-overview-card--missing .entity-overview-card__artwork {
    opacity: 0.72;
  }

  @media (max-width: 520px) {
    .entity-overview-card {
      grid-template-rows: 284px 124px;
    }

    .entity-overview-card.entity-overview-card--dense {
      grid-template-rows: 190px 122px;
    }
  }
</style>
