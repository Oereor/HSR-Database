<script lang="ts">
  import { Dialog as DialogPrimitive } from 'bits-ui';
  import Users from '@lucide/svelte/icons/users';
  import { afterNavigate } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import type { EnemyOccurrenceView } from '$lib/domain/endgame-view';
  import { gameTextToPlain } from '$lib/domain/game-text';
  import { m } from '$lib/paraglide/messages.js';
  import EndgameEnemyCard from './EndgameEnemyCard.svelte';
  import { endgameEnemyGridClass, type EndgameEnemyCardVariant } from './presentation';

  export let name: string;
  export let targets: NonNullable<EnemyOccurrenceView['summonTargets']>;
  export let variant: EndgameEnemyCardVariant;

  let open = false;
  afterNavigate(() => {
    open = false;
  });
</script>

<Dialog.Root bind:open>
  <DialogPrimitive.Trigger data-endgame-summon-trigger>
    {#snippet child({ props })}
      <Button {...props} variant="outline" size="sm" class="relative z-20 w-full whitespace-normal">
        <Users aria-hidden="true" />
        {m.endgame_summon_trigger({ count: targets.length })}
      </Button>
    {/snippet}
  </DialogPrimitive.Trigger>
  <Dialog.Content class="max-w-[56rem]" data-endgame-summon-dialog>
    <Dialog.Header class="items-start">
      <Dialog.Title class="min-w-0 wrap-anywhere"
        >{m.endgame_summon_title({ name: gameTextToPlain(name) })}</Dialog.Title
      >
      <Dialog.Close label={m.endgame_summon_close()} />
    </Dialog.Header>
    <Dialog.Body>
      <DialogPrimitive.Description class="text-muted-foreground mb-4 text-sm">
        {m.endgame_summon_description()}
      </DialogPrimitive.Description>
      {#if open}
        <div class={endgameEnemyGridClass} data-enemy-grid>
          {#each targets as target (target.enemy.identity)}
            <EndgameEnemyCard occurrence={target.enemy} level={target.level} {variant} />
          {/each}
        </div>
      {/if}
    </Dialog.Body>
  </Dialog.Content>
</Dialog.Root>
