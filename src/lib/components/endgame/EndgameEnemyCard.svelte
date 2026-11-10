<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import SemanticIconLabel from '$lib/components/shared/SemanticIconLabel.svelte';
  import { getElementColor } from '$lib/domain/elements';
  import { ENDGAME_MISSING_VALUE, type EnemyOccurrenceView } from '$lib/domain/endgame-view';
  import HpDisplay from './HpDisplay.svelte';
  import type { EndgameEnemyCardVariant } from './presentation';
  import { m } from '$lib/paraglide/messages.js';
  import { localizedHref } from '$lib/i18n/routing';

  export let occurrence: EnemyOccurrenceView;
  export let variant: EndgameEnemyCardVariant = 'standard';
  export let level: number | undefined = undefined;

  let imageMissing = !occurrence.portraitUrl?.trim();
</script>

<article
  class:endgame-enemy--compact={variant === 'compact'}
  class:endgame-enemy--link={!!occurrence.enemyHref}
  class:endgame-enemy--with-art={!imageMissing}
  class={`endgame-enemy ${occurrence.enemyHref ? 'group cursor-pointer' : ''} has-[:focus-visible]:ring-ring/50 relative isolate block h-full w-full max-w-[260px] min-w-0 justify-self-start rounded-lg has-[:focus-visible]:ring-3`}
  data-endgame-enemy-card
  data-enemy-card-variant={variant}
  data-monster-id={occurrence.monsterId}
  data-template-id={occurrence.monsterTemplateId}
  data-endgame-enemy-level={level}
>
  <Card.Root
    size="sm"
    class="group-hover:border-primary/40 group-focus-visible:border-ring h-full gap-0 overflow-hidden py-0 transition-colors"
  >
    <div
      class={`endgame-enemy__artwork border-border pointer-events-none relative grid w-full shrink-0 items-end justify-items-center overflow-hidden border-b ${variant === 'compact' ? 'h-[170px]' : 'h-[190px]'}`}
      style="background: var(--secondary);"
      aria-hidden="true"
    >
      <AssetImage
        src={occurrence.portraitUrl}
        alt=""
        loading="lazy"
        decoding="async"
        width="1024"
        height="1024"
        data-enemy-portrait
        bind:missing={imageMissing}
        class="absolute inset-0 block size-full max-w-full object-cover object-[center_35%] opacity-[0.94] select-none"
        fallbackClass="endgame-enemy__fallback size-28 place-self-center rounded-full border border-border bg-muted/20 leading-none [--image-fallback-font-size:2.25rem]"
      />
      {#if level !== undefined || occurrence.voracityLevel !== undefined || occurrence.count}
        <span
          class="endgame-enemy__artwork-tags pointer-events-none absolute top-3 right-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-end gap-1"
        >
          {#if occurrence.voracityLevel !== undefined}
            <span
              class="endgame-enemy__level-tags flex max-w-full flex-wrap items-center justify-end gap-1"
            >
              <Badge
                variant="outline"
                class="endgame-enemy__voracity border-red-400/30 bg-red-950/75 text-red-300"
                data-voracity-level={occurrence.voracityLevel}
                >{m.endgame_enemy_voracity({ level: occurrence.voracityLevel })}</Badge
              >
              {#if level !== undefined}<Badge
                  variant="outline"
                  class="endgame-enemy__level bg-background/80 text-muted-foreground tabular-nums"
                  >Lv.{level}</Badge
                >{/if}
            </span>
          {:else if level !== undefined}<Badge
              variant="outline"
              class="endgame-enemy__level bg-background/80 text-muted-foreground tabular-nums"
              >Lv.{level}</Badge
            >{/if}
          {#if occurrence.count}<Badge
              variant="outline"
              class="endgame-enemy__count bg-background/80 text-primary"
              aria-label={m.endgame_enemy_count_aria({ count: occurrence.count })}
              >×{occurrence.count}</Badge
            >{/if}
        </span>
      {/if}
    </div>

    <Card.Content
      class={`endgame-enemy__content flex w-full min-w-0 flex-1 flex-col ${variant === 'compact' ? 'p-3 group-data-[size=sm]/card:px-3' : 'p-4'}`}
    >
      <header class="endgame-enemy__identity mb-4">
        <h5
          class="endgame-enemy__name text-foreground group-hover:text-primary m-0 text-sm leading-relaxed font-semibold wrap-anywhere"
        >
          {#if occurrence.enemyHref}
            <a
              href={localizedHref(occurrence.enemyHref)}
              class="outline-none after:absolute after:inset-0 after:z-10 after:rounded-lg"
              data-endgame-enemy-link><GameText text={occurrence.name} /></a
            >
          {:else}
            <GameText text={occurrence.name} />
          {/if}
        </h5>
      </header>

      <dl
        class="endgame-enemy__stats [&_dt]:text-muted-foreground m-0 grid gap-2 text-xs [&_dd]:m-0 [&_dd]:flex [&_dd]:min-w-0 [&_dd]:flex-wrap [&_dd]:items-center [&_dd]:justify-end [&_dd]:gap-1 [&_dd]:text-right [&_dt]:leading-relaxed [&_strong]:text-sm [&_strong]:leading-relaxed [&_strong]:wrap-anywhere [&_strong]:tabular-nums [&>div]:grid [&>div]:min-w-0 [&>div]:grid-cols-[3.85rem_minmax(0,1fr)] [&>div]:items-start [&>div]:gap-2"
      >
        <div>
          <dt>{m.common_hp()}</dt>
          <dd><HpDisplay hp={occurrence.hp} /></dd>
        </div>
        <div class="endgame-enemy__stat--short">
          <dt>{m.common_speed()}</dt>
          <dd><strong data-endgame-speed>{occurrence.speed.rounded}</strong></dd>
        </div>
        <div class="endgame-enemy__stat--short">
          <dt>{m.endgame_enemy_toughness()}</dt>
          <dd>
            <strong data-endgame-toughness>
              {occurrence.toughness
                .roundedPerBar}{#if occurrence.toughness.exactPerBar && occurrence.toughness.barCount && occurrence.toughness.barCount > 1}<span
                  class="endgame-stat__multiplier text-primary"
                >
                  &nbsp;× {occurrence.toughness.barCount}</span
                >{/if}
            </strong>
          </dd>
        </div>
        <div class="endgame-enemy__weakness-row">
          <dt>{m.endgame_enemy_weaknesses()}</dt>
          <dd>
            {#if occurrence.weaknesses.length}
              <div
                class="endgame-weaknesses flex min-w-0 flex-wrap items-center justify-end gap-2"
                aria-label={m.endgame_enemy_weaknesses()}
              >
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
              <span class="endgame-enemy__missing text-muted-foreground text-xs"
                >{ENDGAME_MISSING_VALUE}</span
              >
            {/if}
          </dd>
        </div>
      </dl>
    </Card.Content>
  </Card.Root>
</article>
