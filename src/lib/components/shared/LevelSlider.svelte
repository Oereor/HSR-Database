<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';

  export let id: string;
  export let label: string;
  export let value: number;
  export let min: number;
  export let max: number;
  export let step = 1;
  export let displayValue: number | undefined = undefined;
  export let ariaValueMin = min;
  export let ariaValueMax = max;
  export let interactive = true;
  export let leadingTag: string | undefined = undefined;

  $: resolvedDisplayValue = displayValue ?? value;
  $: progress = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 100;
</script>

<div class:skill-level-control--readonly={!interactive} class="skill-level-control">
  <div>
    <label for={id}>{label}</label>
    <span class="skill-level-control__value">
      {#if leadingTag}<small class="skill-effect-tag">{leadingTag}</small>{/if}
      <output for={id}>Lv.{resolvedDisplayValue}</output>
    </span>
  </div>
  <input
    {id}
    type="range"
    {min}
    {max}
    {step}
    bind:value
    disabled={!interactive}
    aria-valuemin={ariaValueMin}
    aria-valuemax={ariaValueMax}
    aria-valuenow={resolvedDisplayValue}
    aria-valuetext={m.common_level({ level: resolvedDisplayValue })}
    style={`--level-progress: ${progress}%`}
  />
  <div class="skill-level-range" aria-hidden="true">
    <span>Lv.{ariaValueMin}</span><span>Lv.{ariaValueMax}</span>
  </div>
</div>
