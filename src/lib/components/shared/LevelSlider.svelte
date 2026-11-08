<script lang="ts">
  import { Label } from '$lib/components/ui/label';
  import { Slider } from '$lib/components/ui/slider';
  import { Badge } from '$lib/components/ui/badge';
  import { m } from '$lib/paraglide/messages.js';

  export let compact = false;
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
  export let onValueChange: ((value: number) => void) | undefined = undefined;
  export let leadingTag: string | undefined = undefined;

  $: resolvedDisplayValue = displayValue ?? value;
</script>

<div
  class:skill-level-control--compact={compact}
  class:skill-level-control--readonly={!interactive}
  class="skill-level-control"
>
  <div>
    <Label
      class={compact ? 'sr-only' : undefined}
      id={`${id}-label`}
      for={id}
      onclick={() => document.getElementById(id)?.focus()}>{label}</Label
    >
    <span class="skill-level-control__value">
      {#if leadingTag}<Badge variant="outline" class="skill-effect-tag text-primary"
          >{leadingTag}</Badge
        >{/if}
      <output for={id}>Lv.{resolvedDisplayValue}</output>
    </span>
  </div>
  <Slider
    type="single"
    class={compact ? ['min-w-0 flex-1', !interactive && 'data-[disabled]:opacity-100'] : 'my-3'}
    bind:value
    {min}
    {max}
    {step}
    disabled={!interactive}
    onValueChange={(next) => {
      value = next;
      onValueChange?.(next);
    }}
    thumbProps={{
      id,
      'aria-labelledby': `${id}-label`,
      'aria-valuemin': ariaValueMin,
      'aria-valuemax': ariaValueMax,
      'aria-valuenow': resolvedDisplayValue,
      'aria-valuetext': m.common_level({ level: resolvedDisplayValue }),
      'data-value': value,
      'data-slider-min': min,
      'data-slider-max': max,
      'data-slider-step': step
    }}
  />
  {#if !compact}<div class="skill-level-range" aria-hidden="true">
      <span>Lv.{ariaValueMin}</span><span>Lv.{ariaValueMax}</span>
    </div>{/if}
</div>

<style>
  .skill-level-control--compact {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    margin: 0;
  }
  .skill-level-control--compact .skill-level-control__value {
    flex-shrink: 0;
    white-space: nowrap;
  }
  .skill-level-control--compact output {
    display: inline-block;
    min-inline-size: 5ch;
  }
  .skill-level-control--compact > div:first-child {
    display: contents;
  }
</style>
