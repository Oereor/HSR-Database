<script lang="ts">
  import type { CatalogEntry } from '$lib/domain/types';
  import { getElementColor } from '$lib/domain/elements';
  import GameText from '$lib/components/GameText.svelte';
  import CharacterAvatar from '$lib/components/CharacterAvatar.svelte';
  import SemanticIconLabel from '$lib/components/SemanticIconLabel.svelte';

  export let entry: CatalogEntry;
  export let href: string;
  export let kind: string;

  const kindLabels: Record<string, string> = {
    character: '角色',
    'light-cone': '光锥',
    relic: '遗器',
    item: '物品',
    enemy: '敌人'
  };
</script>

<a class="entity-card" data-kind={kind} {href}>
  <div class="entity-card__body">
    <div class="entity-card__eyebrow">
      {#if kind !== 'character'}<span class="entity-kind">{kindLabels[kind] ?? '资料'}</span>{/if}
      <span class="entity-card__id">ID {entry.id}</span>
    </div>
    <div class:entity-card__identity={kind === 'character'}>
      {#if kind === 'character'}<CharacterAvatar
          characterId={entry.id}
          characterName={entry.name}
        />{/if}
      <div class="entity-card__identity-copy">
        <h3><GameText text={entry.name} /></h3>
        <div class="entity-card__tags">
          {#if entry.rarity}<span class="tone-rarity" aria-label={`${entry.rarity}星`}
              >{'★'.repeat(entry.rarity)}</span
            >{/if}
          {#if entry.pathName}<SemanticIconLabel
              kind="path"
              code={entry.path}
              label={entry.pathName}
            />{/if}
          {#if entry.elementName}<SemanticIconLabel
              kind="element"
              code={entry.element}
              label={entry.elementName}
              color={getElementColor(entry.element)}
            />{/if}
          {#if entry.typeName}<span>{entry.typeName}</span>{/if}
          {#if entry.version}<span>版本 {entry.version}</span>{/if}
        </div>
      </div>
    </div>
    <p><GameText text={entry.description || '暂无可展示的文字说明。'} /></p>
  </div>
</a>
