<script lang="ts">
  import type { PureFictionCacophonyView } from '$lib/domain/endgame-view';
  import BuffOptionGroup from '../mechanics/BuffOptionGroup.svelte';

  export let cacophony: PureFictionCacophonyView;
</script>

<section class="endgame-mechanics-section pf-cacophony" data-endgame-mechanics="cacophony">
  <BuffOptionGroup title="荒腔走板" options={cacophony.options} headingLevel={2} />
</section>

<style>
  .pf-cacophony {
    min-width: 0;
  }
</style>
