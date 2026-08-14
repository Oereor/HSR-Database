<script lang="ts">
  import { goto } from '$app/navigation';
  import type { EndgameMode } from '$lib/domain/endgame';
  import type { EndgamePeriodView } from '$lib/domain/endgame-view';

  export let mode: EndgameMode;
  export let periods: EndgamePeriodView[];
  export let selectedGroupId: number;

  function navigate(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (value) void goto(`/endgame/${mode}/${value}`);
  }

  const statusLabel = (status: EndgamePeriodView['status']) =>
    ({ current: '当前', upcoming: '即将开放', historical: '历史', unknown: '时间未知' })[status];
</script>

<label class="endgame-period-select">
  <span>赛期</span>
  <select value={String(selectedGroupId)} on:change={navigate} aria-label="选择赛期">
    {#each periods as period}
      <option value={period.groupId}>
        {period.name} · {statusLabel(period.status)} · {period.dateLabel}
      </option>
    {/each}
  </select>
</label>
