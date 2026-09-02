<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/stores';
  import { formatDocumentTitle } from '$lib/site';
</script>

<svelte:head><title>{formatDocumentTitle(String($page.status))}</title></svelte:head>
<section class="empty-state error-state">
  <p class="kicker">ERROR {$page.status}</p>
  <h1>{$page.status === 404 ? '这条星轨暂不存在' : '资料读取失败'}</h1>
  <p>{$page.error?.message ?? '请稍后重试。'}</p>
  <a class="button" href={resolve('/')}>返回总览</a>
</section>
