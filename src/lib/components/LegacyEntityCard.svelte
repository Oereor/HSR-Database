<script lang="ts">
  import type { CatalogEntry } from '$lib/domain/types';
  import GameText from '$lib/components/GameText.svelte';
  import SemanticIconLabel from '$lib/components/SemanticIconLabel.svelte';

  export let entry: CatalogEntry;
  export let href: string;
  export let kind: 'light-cone' | 'relic';

  const kindLabels = { 'light-cone': '光锥', relic: '遗器' } as const;
</script>

<a class="entity-card" data-kind={kind} {href}>
  <div class="entity-card__body">
    <div class="entity-card__eyebrow">
      <span class="entity-kind">{kindLabels[kind]}</span>
      <span class="entity-card__id">ID {entry.id}</span>
    </div>
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
        {#if entry.typeName}<span>{entry.typeName}</span>{/if}
        {#if entry.version}<span>版本 {entry.version}</span>{/if}
      </div>
    </div>
    <p><GameText text={entry.description || '暂无可展示的文字说明。'} /></p>
  </div>
</a>
