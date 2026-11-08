<script lang="ts">
  import './slider.css';
  import TraceCardPanel from '$lib/components/character/TraceCardPanel.svelte';
  import type { Trace } from '$lib/domain/types';

  const traces: Trace[] = ['HPDelta', 'SpeedDelta'].map((propertyType, index) => ({
    id: String(index),
    name: propertyType,
    description: '',
    type: 'stat',
    sourcePointType: 1,
    prerequisiteIds: [],
    anchorOrder: index,
    propertyType,
    statBonus: { propertyType, value: 2, percent: false }
  }));
</script>

<div class="dark" data-trace-grid-fixture>
  <TraceCardPanel {traces} />
</div>
