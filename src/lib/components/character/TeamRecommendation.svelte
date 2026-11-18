<script lang="ts">
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
  import * as Card from '$lib/components/ui/card';
  import * as Popover from '$lib/components/ui/popover';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Button } from '$lib/components/ui/button';
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import { getCharacterIconUrl } from '$lib/data/visual-assets';
  import { gameTextToPlain } from '$lib/domain/game-text';
  import {
    presentTeamRecommendations,
    type TeamRecommendationPageData
  } from '$lib/domain/team-recommendation';
  import type { TrailblazerGender } from '$lib/domain/trailblazer';
  import type { CatalogEntry } from '$lib/domain/types';
  import { localizedHref } from '$lib/i18n/routing';
  import { m } from '$lib/paraglide/messages.js';

  export let data: TeamRecommendationPageData;
  export let gender: TrailblazerGender;

  $: teams = presentTeamRecommendations(data, gender);
</script>

{#snippet avatarLink(avatar: CatalogEntry, primary = false)}
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <a
          {...props}
          href={localizedHref(`/characters/${avatar.id}/`)}
          aria-label={gameTextToPlain(avatar.name)}
          data-team-avatar={avatar.id}
          class="bg-muted hover:border-primary focus-visible:ring-ring block aspect-square min-w-0 overflow-hidden rounded-md border outline-none focus-visible:ring-2"
          class:w-full={primary}
          class:max-w-16={primary}
          class:w-10={!primary}
        >
          <AssetImage
            src={getCharacterIconUrl(avatar.id)}
            alt=""
            width={primary ? '64' : '40'}
            height={primary ? '64' : '40'}
            class="block size-full object-contain"
            fallbackClass="block size-full"
          />
        </a>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content class="z-60">
      <GameText text={avatar.name} />
    </Tooltip.Content>
  </Tooltip.Root>
{/snippet}

<section class="equipment-recommendation__group" aria-labelledby="build-guide-teams">
  <SectionHeading level={2} id="build-guide-teams">
    {m.build_guide_teams()}
    <svelte:fragment slot="meta">{m.build_guide_team_source()}</svelte:fragment>
  </SectionHeading>
  <div class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-3">
    {#each teams as team (team.teamId)}
      <Card.Root size="sm" data-team-id={team.teamId} data-team-source-avatar={team.sourceAvatarId}>
        <Card.Header>
          <Card.Title>{m.build_guide_team_number({ number: team.teamId })}</Card.Title>
        </Card.Header>
        <Card.Content>
          <ol class="m-0 grid min-w-0 list-none grid-cols-4 gap-2 p-0">
            {#each team.slots as { avatar, backups, groups }, index (index)}
              <li
                class="flex min-w-0 flex-col items-center gap-1"
                data-team-slot={index + 1}
                data-team-target={index + 1 === team.position ? '' : undefined}
              >
                {@render avatarLink(avatar, true)}
                {#if backups.length || groups.length}
                  <Popover.Root>
                    <Popover.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          variant="ghost"
                          size="icon-sm"
                          aria-label={m.build_guide_team_slot_backups({
                            number: index + 1,
                            name: gameTextToPlain(avatar.name)
                          })}
                          data-team-backups-trigger
                        >
                          <ChevronDownIcon aria-hidden="true" />
                        </Button>
                      {/snippet}
                    </Popover.Trigger>
                    <Popover.Content
                      align="start"
                      class="max-h-[min(52dvh,22rem)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain p-3"
                    >
                      {#if backups.length}
                        <section class="grid gap-2" data-team-direct-backups>
                          <h4 class="m-0 text-sm font-medium">
                            {m.build_guide_team_direct_backups()}
                          </h4>
                          <div class="flex flex-wrap gap-2">
                            {#each backups as backup (backup.id)}
                              {@render avatarLink(backup)}
                            {/each}
                          </div>
                        </section>
                      {/if}
                      {#each groups as group (`${group.id}:${group.ordinal}`)}
                        <section class="grid gap-2" data-team-backup-group={group.id}>
                          <h4 class="m-0 text-sm font-medium">
                            {m.build_guide_team_backup_group({ number: group.ordinal })}
                          </h4>
                          <div class="flex flex-wrap gap-2">
                            {#each group.avatars as backup (backup.id)}
                              {@render avatarLink(backup)}
                            {/each}
                          </div>
                        </section>
                      {/each}
                    </Popover.Content>
                  </Popover.Root>
                {/if}
              </li>
            {/each}
          </ol>
        </Card.Content>
      </Card.Root>
    {/each}
  </div>
</section>
