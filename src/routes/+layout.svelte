<script lang="ts">
  import '../styles/app.css';
  import '../styles/presentation/detail-hero.css';
  import '../styles/presentation/detail-inspection.css';
  import { page } from '$app/stores';
  import Navigator from '$lib/components/Navigator.svelte';

  export let data;
</script>

<svelte:head>
  <meta property="og:site_name" content="星轨档案库" />
  <meta property="og:type" content="website" />
  <link rel="canonical" href={`${data.siteUrl}${$page.url.pathname}`} />
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
        数据来源：<a href="https://github.com/Oereor/TurnBasedGameData">TurnBasedGameData</a
        >；角色与光锥视觉资源来源：<a href="https://github.com/Oereor/StarRailRes">StarRailRes</a
        >（<a href="/licenses/StarRailRes-AGPL-3.0.txt">AGPL-3.0 许可证</a
        >）。数据可能延迟或存在错误；测试服、未发布或来源不明确的内容不会自动视为正式内容。
      </p>
      <p><a href="/third-party-notices.txt">第三方资源与权利声明</a></p>
    </footer>
  </main>
</div>
