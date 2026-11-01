<script lang="ts">
  import { Toggle } from '$lib/components/ui/toggle';
  import { gameTextToPlain } from '$lib/domain/game-text';
  export let name: string;
  export let active: boolean;
  export let onToggle: () => void;
</script>

<Toggle
  class="trace-toggle absolute inset-0 z-1 size-full rounded-[inherit] border-0 bg-transparent p-0 hover:bg-transparent aria-pressed:bg-transparent"
  type="button"
  aria-label={gameTextToPlain(name)}
  pressed={active}
  onPressedChange={onToggle}
></Toggle>
