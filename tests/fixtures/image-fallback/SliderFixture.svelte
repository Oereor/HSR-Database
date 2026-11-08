<script lang="ts">
  import './slider.css';
  import LevelSlider from '$lib/components/shared/LevelSlider.svelte';
  let value = $state(10);
  let index = $state(1);
  let disabled = $state(false);
  let events = $state<number[]>([]);
  const levels = [2, 4, 7, 10];
</script>

<div class="dark slider-fixture">
  <LevelSlider
    id="fixture-step"
    label="Synthetic stepped level"
    bind:value
    min={0}
    max={20}
    step={2}
    interactive={!disabled}
    onValueChange={(next) => (events = [...events, next])}
  />
  <LevelSlider
    id="fixture-index"
    label="Synthetic mapped level"
    bind:value={index}
    min={0}
    max={3}
    displayValue={levels[index]}
    ariaValueMin={2}
    ariaValueMax={10}
  />
  <LevelSlider
    compact
    id="fixture-compact"
    label="Synthetic compact level"
    value={9}
    min={1}
    max={10}
  />
  <button onclick={() => (value = 14)}>External update</button>
  <button onclick={() => (disabled = !disabled)}>Toggle disabled</button>
  <output data-events>{JSON.stringify(events)}</output>
</div>

<style>
  .slider-fixture {
    width: min(100%, 400px);
    padding: 32px;
  }
</style>
