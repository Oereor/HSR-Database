<script lang="ts">
  import type { PureFictionCacophonyView } from '$lib/domain/endgame-view';
  import BuffOptionGroup from '../mechanics/BuffOptionGroup.svelte';
  import { m } from '$lib/paraglide/messages.js';

  export let cacophony: PureFictionCacophonyView;
</script>

<section
  class="endgame-mechanics-section pf-cacophony mb-6 min-w-0"
  data-endgame-mechanics="cacophony"
>
  <BuffOptionGroup title={m.endgame_cacophony()} options={cacophony.options} headingLevel={2} />
</section>
