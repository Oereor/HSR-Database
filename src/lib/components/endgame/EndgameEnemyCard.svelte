<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import SemanticIconLabel from '$lib/components/SemanticIconLabel.svelte';
  import { getElementColor } from '$lib/domain/elements';
  import type { EnemyOccurrenceView } from '$lib/domain/endgame-view';
  import HpDisplay from './HpDisplay.svelte';
  import type { EndgameEnemyCardVariant } from './presentation';

  export let occurrence: EnemyOccurrenceView;
  export let variant: EndgameEnemyCardVariant = 'standard';

  let portraitFailed = false;
</script>

<article
  class:endgame-enemy--compact={variant === 'compact'}
  class:endgame-enemy--with-art={occurrence.portraitUrl && !portraitFailed}
  class="endgame-enemy"
  data-endgame-enemy-card
  data-enemy-card-variant={variant}
  data-monster-id={occurrence.monsterId}
  data-template-id={occurrence.monsterTemplateId}
>
  <div class="endgame-enemy__artwork" aria-hidden="true">
    {#if occurrence.portraitUrl && !portraitFailed}
      <img
        src={occurrence.portraitUrl}
        alt=""
        loading="lazy"
        decoding="async"
        width="376"
        height="512"
        data-enemy-portrait
        on:error={() => (portraitFailed = true)}
      />
    {:else}
      <span class="endgame-enemy__fallback">敌</span>
    {/if}
    {#if occurrence.count}
      <span class="endgame-enemy__count" aria-label={`数量 ${occurrence.count}`}
        >×{occurrence.count}</span
      >
    {/if}
  </div>

  <div class="endgame-enemy__content">
    <header class="endgame-enemy__identity">
      <h5 class="endgame-enemy__name">
        {#if occurrence.enemyHref}
          <a href={occurrence.enemyHref}><GameText text={occurrence.name} /></a>
        {:else}
          <GameText text={occurrence.name} />
        {/if}
      </h5>
    </header>

    <dl class="endgame-enemy__stats">
      <div>
        <dt>生命值</dt>
        <dd><HpDisplay hp={occurrence.hp} /></dd>
      </div>
      <div class="endgame-enemy__stat--short">
        <dt>速度</dt>
        <dd><strong data-endgame-speed>{occurrence.speed.rounded}</strong></dd>
      </div>
      <div class="endgame-enemy__stat--short">
        <dt>韧性值</dt>
        <dd>
          <strong data-endgame-toughness>
            {occurrence.toughness
              .roundedPerBar}{#if occurrence.toughness.exactPerBar && occurrence.toughness.barCount && occurrence.toughness.barCount > 1}<span
                class="endgame-stat__multiplier"
              >
                &nbsp;× {occurrence.toughness.barCount}</span
              >{/if}
          </strong>
        </dd>
      </div>
      <div class="endgame-enemy__weakness-row">
        <dt>弱点属性</dt>
        <dd>
          {#if occurrence.weaknesses.length}
            <div class="endgame-weaknesses" aria-label="弱点属性">
              {#each occurrence.weaknesses as weakness}
                <SemanticIconLabel
                  kind="element"
                  code={weakness.element}
                  label={weakness.name}
                  color={getElementColor(weakness.element)}
                  showLabel={false}
                />
              {/each}
            </div>
          {:else}
            <span class="endgame-enemy__missing">资料暂无</span>
          {/if}
        </dd>
      </div>
    </dl>
  </div>
</article>
