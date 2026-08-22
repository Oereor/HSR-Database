<script lang="ts">
  import DetailPage from '$lib/components/DetailPage.svelte';
  export let data;
</script>

<DetailPage
  detail={data.detail}
  category={data.category}
  singular={data.config.singular}
  specialEffectTargets={data.specialEffectTargets}
/>
