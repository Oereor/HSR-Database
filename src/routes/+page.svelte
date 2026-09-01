<script lang="ts">
  import type { PageData } from './$types';
  import CharacterOverviewCard from '$lib/components/CharacterOverviewCard.svelte';
  import LightConeOverviewCard from '$lib/components/LightConeOverviewCard.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import {
    getCharacterPreviewUrl,
    getLightConePreviewUrl,
    getNavigationIconUrl
  } from '$lib/data/visual-assets';
  import { NAVIGATION_ITEMS } from '$lib/navigation';

  export let data: PageData;

  const directoryItems = NAVIGATION_ITEMS.filter((item) => item.id !== 'overview');
  const marchPreview = getCharacterPreviewUrl('1001');
  const thisIsMePreview = getLightConePreviewUrl('21030');
  const danHengPreview = getCharacterPreviewUrl('1002');
  const onlySilencePreview = getLightConePreviewUrl('21003');

  function recordCount(id: (typeof directoryItems)[number]['id']): number {
    if (id === 'characters') return data.manifest.counts.characters;
    if (id === 'light-cones') return data.manifest.counts.lightCones;
    if (id === 'relics') return data.manifest.counts.relics;
    if (id === 'enemies') return data.manifest.counts.enemies;
    return Object.values(data.manifest.endgame.modes).reduce(
      (total, mode) => total + mode.encounters,
      0
    );
  }
</script>

<svelte:head>
  <title>崩坏：星穹铁道 档案库</title>
  <meta
    name="description"
    content="基于真实游戏配置构建的崩坏：星穹铁道角色、光锥、遗器、敌方单位与高难模式资料库。"
  />
  <meta property="og:title" content="崩坏：星穹铁道 档案库" />
  <meta
    property="og:description"
    content="可搜索的崩坏：星穹铁道角色、光锥、遗器、敌方单位与高难模式非官方资料库。"
  />
</svelte:head>

<div class="homepage">
  <section class="home-hero" aria-labelledby="home-title">
    <div class="home-hero__identity">
      <h1 id="home-title">崩坏：星穹铁道 档案库</h1>
      <p>HONKAI: STAR RAIL DATA ARCHIVE</p>
    </div>

    <div class="home-hero__collage" aria-hidden="true">
      {#if onlySilencePreview}
        <img
          class="home-hero__light-cone home-hero__light-cone--silence"
          src={onlySilencePreview}
          alt=""
        />
      {/if}
      {#if danHengPreview}
        <img
          class="home-hero__character home-hero__character--dan-heng"
          src={danHengPreview}
          alt=""
        />
      {/if}
      {#if thisIsMePreview}
        <img
          class="home-hero__light-cone home-hero__light-cone--this-is-me"
          src={thisIsMePreview}
          alt=""
        />
      {/if}
      {#if marchPreview}
        <img class="home-hero__character home-hero__character--march" src={marchPreview} alt="" />
      {/if}
    </div>
  </section>

  <section class="home-directory" aria-label="数据库入口">
    <form class="home-search" action="/search" role="search">
      <label class="sr-only" for="home-search">搜索资料库</label>
      <input id="home-search" name="q" placeholder="输入名称，搜索资料库" />
      <button type="submit">搜索</button>
    </form>

    <nav class="home-directory__list" aria-label="数据库分类">
      {#each directoryItems as item}
        {@const iconUrl = getNavigationIconUrl(item.iconKey)}
        <a class="home-directory-row" href={item.href}>
          <span class="home-directory-row__identity">
            <span class="home-directory-row__icon" aria-hidden="true">
              {#if iconUrl}<img src={iconUrl} alt="" />{:else}<span>{item.fallback}</span>{/if}
            </span>
            <strong>{item.label}</strong>
          </span>
          <span class="home-directory-row__meta">
            <span>{recordCount(item.id)} 条记录</span><span aria-hidden="true">→</span>
          </span>
        </a>
      {/each}
    </nav>
  </section>

  <section class="home-recent" aria-labelledby="recent-avatar-ups">
    <SectionHeading level={1} id="recent-avatar-ups">最近限定角色跃迁</SectionHeading>
    <div class="home-recent-grid" data-homepage-recent="avatar">
      {#each data.recentCharacters as entry}
        <CharacterOverviewCard
          {entry}
          href={`/characters/${entry.id}`}
          imageUrl={getCharacterPreviewUrl(entry.id)}
          density="compact"
        />
      {/each}
    </div>
  </section>

  <section class="home-recent" aria-labelledby="recent-weapon-ups">
    <SectionHeading level={1} id="recent-weapon-ups">最近限定光锥跃迁</SectionHeading>
    <div class="home-recent-grid" data-homepage-recent="weapon">
      {#each data.recentLightCones as entry}
        <LightConeOverviewCard
          {entry}
          href={`/light-cones/${entry.id}`}
          imageUrl={getLightConePreviewUrl(entry.id)}
        />
      {/each}
    </div>
  </section>
</div>

<style>
  .homepage {
    width: 100%;
  }

  .home-hero {
    position: relative;
    display: flex;
    min-height: 360px;
    align-items: center;
    overflow: hidden;
    border-bottom: 1px solid var(--border);
    background:
      radial-gradient(circle at 78% 45%, rgb(91 130 210 / 14%), transparent 34rem),
      linear-gradient(110deg, rgb(14 20 34 / 36%), transparent 62%);
  }

  .home-hero__identity {
    position: relative;
    z-index: 5;
    width: 100%;
    padding: var(--space-12) 0;
  }

  .home-hero h1 {
    margin: 0;
    font-size: clamp(2.45rem, 4.4vw, 4.25rem);
    line-height: 1.08;
    letter-spacing: -0.05em;
    white-space: nowrap;
  }

  .home-hero__identity p {
    margin: var(--space-4) 0 0;
    color: var(--gold);
    font-size: clamp(0.72rem, 1.2vw, 0.92rem);
    font-weight: 750;
    letter-spacing: 0.2em;
  }

  .home-hero__collage {
    position: absolute;
    z-index: 1;
    inset: 0 0 0 auto;
    width: min(68%, 880px);
    min-height: 360px;
    isolation: isolate;
    mask-image: linear-gradient(90deg, transparent 0%, rgb(0 0 0 / 15%) 18%, #000 48%, #000 100%);
    -webkit-mask-image: linear-gradient(
      90deg,
      transparent 0%,
      rgb(0 0 0 / 15%) 18%,
      #000 48%,
      #000 100%
    );
  }

  .home-hero__collage::after {
    position: absolute;
    z-index: 6;
    inset: 0;
    background:
      linear-gradient(90deg, var(--bg) 0%, transparent 20%, transparent 76%, var(--bg) 100%),
      linear-gradient(0deg, var(--bg) 0%, transparent 28%);
    content: '';
    pointer-events: none;
  }

  .home-hero__collage img {
    position: absolute;
    display: block;
    object-fit: contain;
    filter: saturate(0.9);
  }

  .home-hero__character--march {
    z-index: 5;
    bottom: -12%;
    left: 24%;
    width: min(42%, 300px);
  }

  .home-hero__character--dan-heng {
    z-index: 2;
    right: -2%;
    bottom: -16%;
    width: min(37%, 265px);
    opacity: 0.76;
  }

  .home-hero__light-cone--this-is-me {
    z-index: 4;
    right: 12%;
    bottom: 5%;
    width: min(31%, 210px);
    opacity: 0.92;
    transform: rotate(5deg);
  }

  .home-hero__light-cone--silence {
    z-index: 1;
    top: 7%;
    left: 7%;
    width: min(26%, 180px);
    opacity: 0.62;
    transform: rotate(-7deg);
  }

  .home-directory {
    padding-top: var(--space-8);
  }

  .home-search {
    display: grid;
    width: 100%;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .home-search input {
    width: 100%;
    min-width: 0;
    min-height: 48px;
    background: rgb(7 10 18 / 72%);
  }

  .home-search button {
    min-width: 7.5rem;
    border: 1px solid rgb(255 255 255 / 8%);
    border-radius: var(--radius-control);
    background: linear-gradient(135deg, #c7a55e, #806431);
    padding: 0.72rem 1.35rem;
    color: #0b0d12;
    font-weight: 800;
  }

  .home-directory__list {
    display: grid;
    gap: var(--space-2);
  }

  .home-directory-row {
    display: flex;
    min-height: 64px;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: linear-gradient(105deg, rgb(20 29 45 / 70%), rgb(10 15 25 / 52%));
    padding: 0.68rem var(--space-4);
    transition:
      border-color var(--motion),
      background var(--motion),
      color var(--motion);
  }

  .home-directory-row:hover {
    border-color: var(--border-strong);
    background: linear-gradient(105deg, rgb(25 35 53 / 86%), rgb(12 18 29 / 70%));
  }

  .home-directory-row__identity,
  .home-directory-row__meta {
    display: flex;
    align-items: center;
  }

  .home-directory-row__identity {
    min-width: 0;
    gap: var(--space-3);
  }

  .home-directory-row__identity strong {
    font-size: var(--font-major-title);
  }

  .home-directory-row__icon {
    display: grid;
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    place-items: center;
  }

  .home-directory-row__icon img {
    width: 32px;
    height: 32px;
    object-fit: contain;
    opacity: 0.82;
  }

  .home-directory-row__icon > span {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-secondary);
    font-size: var(--font-internal);
  }

  .home-directory-row__meta {
    flex: 0 0 auto;
    gap: var(--space-3);
    color: var(--text-secondary);
    font-size: var(--font-helper);
  }

  .home-directory-row__meta > span:last-child {
    color: var(--gold);
    font-size: 1.05rem;
    transition: transform var(--motion);
  }

  .home-directory-row:hover .home-directory-row__meta > span:last-child {
    transform: translateX(3px);
  }

  .home-recent {
    padding-top: var(--space-12);
  }

  .home-recent-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: var(--space-3);
  }

  @media (max-width: 1180px) {
    .home-recent-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 820px) {
    .home-hero {
      display: block;
      min-height: 0;
    }

    .home-hero__identity {
      padding: var(--space-8) 0 var(--space-4);
    }

    .home-hero h1 {
      white-space: normal;
    }

    .home-hero__collage {
      position: relative;
      inset: auto;
      width: 100%;
      min-height: 270px;
      mask-image: none;
      -webkit-mask-image: none;
    }

    .home-hero__collage::after {
      background:
        linear-gradient(90deg, var(--bg) 0%, transparent 12%, transparent 88%, var(--bg) 100%),
        linear-gradient(0deg, var(--bg) 0%, transparent 30%);
    }

    .home-hero__character--march {
      left: 31%;
    }

    .home-recent-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 520px) {
    .home-hero h1 {
      font-size: clamp(2.1rem, 11vw, 2.75rem);
    }

    .home-hero__identity p {
      letter-spacing: 0.13em;
    }

    .home-hero__collage {
      min-height: 235px;
    }

    .home-hero__character--march {
      left: 25%;
      width: 46%;
    }

    .home-hero__character--dan-heng {
      width: 41%;
    }

    .home-hero__light-cone--silence {
      left: 0;
      width: 30%;
    }

    .home-hero__light-cone--this-is-me {
      right: 7%;
      width: 34%;
    }

    .home-search {
      gap: var(--space-2);
    }

    .home-search button {
      min-width: 4.75rem;
      padding-inline: var(--space-3);
    }

    .home-directory-row {
      gap: var(--space-3);
      padding-inline: var(--space-3);
    }

    .home-directory-row__meta {
      gap: var(--space-2);
    }
  }

  @media (max-width: 420px) {
    .home-recent-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
