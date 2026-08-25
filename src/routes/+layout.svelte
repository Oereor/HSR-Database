<script lang="ts">
  import '../styles/app.css';
  import '../styles/presentation/detail-hero.css';
  import '../styles/presentation/detail-inspection.css';
  import { page } from '$app/stores';

  export let data;
  let menu: HTMLDialogElement;
  const navigation = [
    ['/', '总览', '⌂'],
    ['/characters', '角色', '人'],
    ['/light-cones', '光锥', '锥'],
    ['/relics', '遗器', '遗'],
    ['/enemies', '敌人', '敌'],
    ['/endgame', 'Endgame', '终'],
    ['/search', '全局搜索', '⌕']
  ];
</script>

<svelte:head>
  <meta property="og:site_name" content="星轨档案库" />
  <meta property="og:type" content="website" />
  <link rel="canonical" href={`${data.siteUrl}${$page.url.pathname}`} />
</svelte:head>

<div class="site-shell">
  <aside class="sidebar">
    <a class="brand" href="/"
      ><span class="brand-mark" aria-hidden="true">轨</span><span
        ><strong>星轨档案库</strong><small>ASTRAL ARCHIVE</small></span
      ></a
    >
    <form class="sidebar-search" action="/search">
      <label for="global-search">全局搜索</label>
      <div>
        <input id="global-search" name="q" placeholder="搜索角色、光锥…" /><button
          aria-label="开始搜索">⌕</button
        >
      </div>
    </form>
    <nav aria-label="主导航">
      {#each navigation as item}<a
          href={item[0]}
          class:active={$page.url.pathname === item[0] ||
            (item[0] !== '/' && $page.url.pathname.startsWith(item[0]))}
          ><span aria-hidden="true">{item[2]}</span>{item[1]}</a
        >{/each}
    </nav>
    <div class="sidebar-meta">
      <span class="status-dot"></span>
      <div>
        <strong>数据版本 4.4</strong><small>{data.manifest.sourceCommit.slice(0, 8)}</small>
      </div>
    </div>
  </aside>

  <header class="mobile-header">
    <a class="brand" href="/"><span class="brand-mark">轨</span><strong>星轨档案库</strong></a
    ><button aria-label="打开导航" on:click={() => menu.showModal()}>☰</button>
  </header>
  <dialog class="mobile-menu" bind:this={menu}>
    <div class="dialog-heading">
      <strong>导航</strong><button aria-label="关闭导航" on:click={() => menu.close()}>×</button>
    </div>
    <nav>
      {#each navigation as item}<a href={item[0]} on:click={() => menu.close()}>{item[1]}</a>{/each}
    </nav>
  </dialog>

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
