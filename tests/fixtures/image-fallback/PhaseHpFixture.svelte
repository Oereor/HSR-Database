<script lang="ts">
  import './slider.css';
  import EndgameEnemyCard from '$lib/components/endgame/EndgameEnemyCard.svelte';
  import EndgameModeNav from '$lib/components/endgame/EndgameModeNav.svelte';
  import type { DecimalString } from '$lib/domain/endgame';
  import type { EnemyOccurrenceView } from '$lib/domain/endgame-view';
  const enemy: EnemyOccurrenceView = {
    identity: 'synthetic',
    monsterId: 1,
    monsterTemplateId: 1,
    name: 'Synthetic enemy',
    enemyHref: '/synthetic-enemy/',
    weaknesses: [],
    hp: {
      roundedPerBar: '100',
      display: 'phases',
      phases: [
        { phase: 1, exact: '100' as DecimalString, rounded: '100' },
        { phase: 2, rounded: '-' }
      ]
    },
    speed: { rounded: '100' },
    toughness: { roundedPerBar: '20' }
  };
  const uniform: EnemyOccurrenceView = {
    ...enemy,
    identity: 'uniform',
    monsterId: 2,
    hp: {
      roundedPerBar: '50',
      display: 'uniform',
      phases: [
        { phase: 1, exact: '100' as DecimalString, rounded: '100' },
        { phase: 2, exact: '100.0' as DecimalString, rounded: '100' }
      ]
    }
  };
  const unknown: EnemyOccurrenceView = {
    ...enemy,
    identity: 'unknown',
    monsterId: 3,
    hp: { roundedPerBar: '100', display: 'plain' }
  };
</script>

<main class="p-6" style="--global-sticky-top: 0px;">
  <div class="max-w-[260px]">
    <EndgameModeNav />
    <EndgameEnemyCard occurrence={enemy} level={100} />
    <EndgameEnemyCard occurrence={uniform} level={100} />
    <EndgameEnemyCard occurrence={unknown} level={100} />
    <div class="h-screen" aria-hidden="true"></div>
  </div>
</main>
