<script lang="ts">
  import DetailPage from '$lib/components/DetailPage.svelte';
  import { categorySingular } from '$lib/i18n/product';
  export let data;
</script>

<DetailPage
  detail={data.detail}
  category={data.category}
  singular={categorySingular(data.category)}
  specialEffectTargets={data.specialEffectTargets}
  equipmentRecommendation={data.equipmentRecommendation}
/>
