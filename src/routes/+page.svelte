<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import CharacterOverviewCard from '$lib/components/character/CharacterOverviewCard.svelte';
  import LightConeOverviewCard from '$lib/components/light-cone/LightConeOverviewCard.svelte';
  import RelicOverviewCard from '$lib/components/relic/RelicOverviewCard.svelte';
  import EnemyOverviewCard from '$lib/components/enemy/EnemyOverviewCard.svelte';
  import HomepageSection from '$lib/components/home/HomepageSection.svelte';
  import SearchBar from '$lib/components/search/SearchBar.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import {
    getCharacterPreviewUrl,
    getCharacterPortraitUrl,
    getLightConePreviewUrl,
    getLightConePortraitUrl,
    getRelicSetIconUrl,
    getNavigationIconUrl
  } from '$lib/data/visual-assets';
  import { selectHomepageArtwork } from '$lib/domain/homepage';
  import { localizedNavigationItems } from '$lib/navigation';
  import { localizedHref } from '$lib/i18n/routing';
  import { siteName } from '$lib/site';
  import type { PageData } from './$types';

  export let data: PageData;
  $: directoryItems = localizedNavigationItems(data.locale).filter(
    (item) => item.id === 'player' || item.id === 'endgame'
  );
  $: characterArt = selectHomepageArtwork(
    data.newCharacters,
    (id) => getCharacterPortraitUrl(id) ?? getCharacterPreviewUrl(id),
    1
  )[0];
  $: lightConeArt = selectHomepageArtwork(
    data.newLightCones,
    (id) => getLightConePortraitUrl(id) ?? getLightConePreviewUrl(id),
    2
  );
  $: version = data.siteVersion.gameVersion ?? data.homepage.gameVersion;
  const name = siteName();
</script>

<svelte:head>
  <title>{name}</title>
  <meta name="description" content={m.home_meta_description()} />
  <meta property="og:title" content={name} />
  <meta property="og:description" content={m.home_og_description()} />
</svelte:head>

<div class="homepage">
  <section class="home-hero" aria-labelledby="home-title">
    <div class="home-hero__identity">
      <p class="home-hero__eyebrow">{m.home_hero_eyebrow()}</p>
      <h1 id="home-title">{m.home_hero_title()}</h1>
      <p class="home-hero__tagline">{m.home_tagline()}</p>
      <span class="home-hero__version">✦ v{version}</span>
      <div class="home-search">
        <SearchBar
          id="home-search"
          label={m.home_search_label()}
          placeholder={m.home_search_placeholder()}
        />
      </div>
    </div>
    <div class="home-hero__art" aria-hidden="true">
      {#if characterArt}<AssetImage
          decorative
          src={characterArt}
          alt=""
          class="home-hero__character"
        />{/if}
      {#each lightConeArt as src, index}
        <div class="home-hero__cone" class:home-hero__cone--back={index === 1}>
          <AssetImage decorative {src} alt="" />
        </div>
      {/each}
    </div>
  </section>

  <nav class="home-directory" aria-label={m.home_categories_aria()}>
    {#each directoryItems as item}
      <a class="home-directory__entry" href={item.href}>
        <AssetImage src={getNavigationIconUrl(item.iconKey)} alt="" decorative />
        <strong>{item.label}</strong><span aria-hidden="true">→</span>
      </a>
    {/each}
  </nav>

  <HomepageSection
    id="new-characters"
    title={m.home_new_characters({ version })}
    href={localizedHref('/characters')}
    total={data.newCharacters.length}
    shown={Math.min(data.newCharacters.length, 6)}
  >
    {#each data.newCharacters.slice(0, 6) as entry}
      <CharacterOverviewCard
        {entry}
        href={localizedHref(`/characters/${entry.id}`)}
        imageUrl={getCharacterPreviewUrl(entry.id)}
        density="compact"
      />
    {/each}
  </HomepageSection>
  <HomepageSection
    id="new-light-cones"
    title={m.home_new_light_cones({ version })}
    href={localizedHref('/light-cones')}
    total={data.newLightCones.length}
    shown={Math.min(data.newLightCones.length, 6)}
  >
    {#each data.newLightCones.slice(0, 6) as entry}
      <LightConeOverviewCard
        {entry}
        href={localizedHref(`/light-cones/${entry.id}`)}
        imageUrl={getLightConePreviewUrl(entry.id)}
      />
    {/each}
  </HomepageSection>
  <HomepageSection
    id="new-relics"
    title={m.home_new_relics({ version })}
    href={localizedHref('/relics')}
    total={data.newRelics.length}
    shown={Math.min(data.newRelics.length, 4)}
  >
    {#each data.newRelics.slice(0, 4) as entry}
      <RelicOverviewCard
        {entry}
        href={localizedHref(`/relics/${entry.id}`)}
        imageUrl={getRelicSetIconUrl(entry.id)}
      />
    {/each}
  </HomepageSection>
  <HomepageSection
    id="new-enemies"
    title={m.home_new_enemies({ version })}
    href={localizedHref('/enemies')}
    total={data.homepage.additions.enemies.length}
    shown={data.newEnemies.length}
  >
    {#each data.newEnemies as entry}
      <EnemyOverviewCard
        {entry}
        href={localizedHref(`/enemies/${entry.id}`)}
        imageUrl={data.enemyPortraits[entry.id]}
      />
    {/each}
  </HomepageSection>
</div>

<style>
  .homepage {
    width: 100%;
  }
  .home-hero {
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: center;
    min-height: 440px;
    overflow: hidden;
    border-bottom: 1px solid var(--border);
    background:
      radial-gradient(ellipse at 76% 35%, rgb(99 125 199 / 22%), transparent 60%),
      radial-gradient(ellipse at 55% 100%, rgb(203 165 87 / 10%), transparent 55%);
  }
  .home-hero::before {
    position: absolute;
    z-index: -1;
    content: '';
    width: 70%;
    height: 55%;
    right: -10%;
    top: 14%;
    border: 1px solid rgb(211 179 114 / 20%);
    border-radius: 50%;
    transform: rotate(-28deg);
    box-shadow: 0 0 50px rgb(152 178 239 / 8%);
  }
  .home-hero__identity {
    position: relative;
    z-index: 3;
    display: grid;
    width: min(56%, 40rem);
    gap: 0.85rem;
    padding: 3rem 0;
  }
  .home-hero__eyebrow {
    color: var(--gold);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.12em;
  }
  .home-hero h1 {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--font-hero-home-title);
    font-weight: 600;
    line-height: 1.25;
    text-wrap: balance;
  }
  .home-hero p {
    margin: 0;
  }
  .home-hero__tagline {
    color: var(--text-secondary);
    line-height: 1.6;
  }
  .home-hero__version {
    justify-self: start;
    border: 1px solid rgb(211 179 114 / 45%);
    border-radius: 2rem;
    padding: 0.25rem 0.8rem;
    color: var(--gold);
    font-size: 0.85rem;
  }
  .home-search {
    margin-top: 0.8rem;
    width: 100%;
  }
  .home-hero__art {
    position: absolute;
    z-index: 1;
    inset: 0 0 0 auto;
    width: 60%;
    pointer-events: none;
    mask-image:
      linear-gradient(90deg, transparent, black 20%), linear-gradient(0deg, transparent, black 20%);
    mask-composite: intersect;
  }
  .home-hero__art :global(.home-hero__character) {
    position: absolute;
    width: 86%;
    height: 120%;
    bottom: -18%;
    left: -5%;
    object-fit: contain;
    filter: drop-shadow(0 10px 40px rgb(87 126 205 / 20%));
  }
  .home-hero__cone {
    position: absolute;
    z-index: 2;
    width: 25%;
    right: 6%;
    top: 29%;
    transform: rotate(12deg);
    filter: drop-shadow(0 12px 18px rgb(0 0 0 / 50%));
  }
  .home-hero__cone :global(img) {
    width: 100%;
    height: auto;
  }
  .home-hero__cone--back {
    z-index: 0;
    right: 20%;
    top: 12%;
    transform: rotate(-10deg);
    opacity: 0.8;
  }
  .home-directory {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    margin-top: 1.5rem;
  }
  .home-directory__entry {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    min-height: 76px;
    padding: 1rem 1.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: linear-gradient(110deg, rgb(25 35 53 / 65%), rgb(10 15 25 / 30%));
  }
  .home-directory__entry:hover {
    border-color: var(--gold);
  }
  .home-directory__entry :global(img) {
    width: 32px;
    height: 32px;
    object-fit: contain;
  }
  .home-directory__entry > span {
    margin-left: auto;
    color: var(--gold);
  }
  @media (max-width: 820px) {
    .home-hero {
      display: block;
      min-height: 0;
    }
    .home-hero__identity {
      width: 100%;
      max-width: 38rem;
      padding: 2rem 0 0.5rem;
    }
    .home-hero__art {
      position: relative;
      inset: auto;
      width: 100%;
      height: 290px;
      mask-image: linear-gradient(0deg, transparent, black 24%);
    }
    .home-hero__art :global(.home-hero__character) {
      left: 2%;
      width: 80%;
      bottom: -20%;
      height: 135%;
    }
    .home-hero__cone {
      width: 20%;
      right: 8%;
      top: 18%;
    }
    .home-hero__cone--back {
      right: 23%;
      top: 5%;
    }
    .home-hero__art:empty {
      height: 2rem;
    }
  }
  @media (max-width: 520px) {
    .home-hero h1 {
      font-size: var(--font-hero-home-title-mobile);
    }
    .home-directory {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.6rem;
    }
    .home-directory__entry {
      min-height: 60px;
      padding: 0.75rem 1rem;
    }
    .home-hero__art {
      height: 240px;
    }
    .home-hero__cone {
      width: 24%;
    }
  }
</style>
