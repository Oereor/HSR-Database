<script lang="ts">
  import '../styles/app.css';
  import '../styles/presentation/detail-hero.css';
  import '../styles/presentation/detail-inspection.css';
  import { page } from '$app/stores';
  import Navigator from '$lib/components/Navigator.svelte';
  import { injectAnalytics } from '@vercel/analytics/sveltekit';
  import { getBrandIconUrl } from '$lib/data/visual-assets';
  import { SITE_NAME } from '$lib/site';

  injectAnalytics();

  export let data;
  const faviconUrl = getBrandIconUrl('train-party');
</script>

<svelte:head>
  <meta property="og:site_name" content={SITE_NAME} />
  <meta property="og:type" content="website" />
  <link rel="canonical" href={`${data.siteUrl}${$page.url.pathname}`} />
  {#if faviconUrl}<link rel="icon" type="image/png" href={faviconUrl} />{/if}
</svelte:head>

<div class="site-shell">
  <Navigator manifest={data.manifest} />

  <main>
    <div class="content"><slot /></div>
    <footer>
      <p>
        本站为非官方玩家制作的数据网站，与米哈游或 HoYoverse
        无官方关联。游戏名称、角色及相关资产的权利归其权利人所有。
      </p>
      <p>
        数据来源：<a href="https://github.com/DimbreathBot/TurnBasedGameData">TurnBasedGameData</a
        >；角色与光锥视觉资源来源：<a href="https://github.com/Mar-7th/StarRailRes">StarRailRes</a
        >（<a href="/licenses/StarRailRes-AGPL-3.0.txt">AGPL-3.0 许可证</a
        >）。数据仅涵盖正式服内容，并可能存在延迟或错误。
      </p>
    </footer>
  </main>
</div>
