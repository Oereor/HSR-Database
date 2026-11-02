<script lang="ts">
  import { Label } from '$lib/components/ui/label';
  import { Slider } from '$lib/components/ui/slider';
  import { Badge } from '$lib/components/ui/badge';
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
  export let onValueChange: ((value: number) => void) | undefined = undefined;
  export let leadingTag: string | undefined = undefined;

  $: resolvedDisplayValue = displayValue ?? value;
</script>

<div class:skill-level-control--readonly={!interactive} class="skill-level-control">
  <div>
    <Label id={`${id}-label`} for={id} onclick={() => document.getElementById(id)?.focus()}
      >{label}</Label
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
    class="my-3"
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
  <div class="skill-level-range" aria-hidden="true">
    <span>Lv.{ariaValueMin}</span><span>Lv.{ariaValueMax}</span>
  </div>
</div>
