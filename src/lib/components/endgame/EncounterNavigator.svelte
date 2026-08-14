<script lang="ts">
  import type { EndgameEncounterView } from '$lib/domain/endgame-view';

  export let encounters: EndgameEncounterView[];
  export let selectedId: string;
  export let mode: 'moc' | 'pf' | 'as';

  const compactLabel = (encounter: EndgameEncounterView) => {
    if (mode === 'as') return `难度 ${encounter.ordinal ?? encounter.id}`;
    if (mode === 'pf') return `其${toChineseNumber(encounter.ordinal)}`;
    return String(encounter.ordinal ?? encounter.id).padStart(2, '0');
  };

  function toChineseNumber(value?: number): string {
    return ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][
      value ?? 0
    ];
  }
</script>

<nav class="endgame-encounter-nav" aria-label="选择关卡">
  {#each encounters as encounter}
    <a
      href={`?encounter=${encodeURIComponent(encounter.id)}`}
      aria-current={selectedId === encounter.id ? 'page' : undefined}
      title={encounter.label}>{compactLabel(encounter)}</a
    >
  {/each}
</nav>
