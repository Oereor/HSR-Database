<script lang="ts">
  import { Slider as SliderPrimitive } from 'bits-ui';
  import { cn } from '$lib/utils.js';
  let {
    value = $bindable(0),
    class: className,
    thumbProps = {},
    onValueChange,
    ...restProps
  }: Omit<
    SliderPrimitive.RootProps,
    'type' | 'value' | 'onValueChange' | 'onValueCommit' | 'children' | 'child'
  > & {
    type?: 'single';
    value?: number;
    onValueChange?: (value: number) => void;
    onValueCommit?: (value: number) => void;
    thumbProps?: Omit<SliderPrimitive.ThumbProps, 'index' | 'child' | 'children'>;
  } = $props();
</script>

<SliderPrimitive.Root
  {...restProps}
  type="single"
  {value}
  onValueChange={(next) => {
    if (next === value) return;
    value = next;
    onValueChange?.(next);
  }}
  data-slot="slider"
  class={cn(
    'relative flex w-full touch-none items-center select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-60',
    className
  )}
>
  <span
    data-slot="slider-track"
    class="bg-muted relative h-1.5 w-full grow overflow-hidden rounded-full"
  >
    <SliderPrimitive.Range data-slot="slider-range" class="bg-primary absolute h-full" />
  </span>
  <SliderPrimitive.Thumb
    {...thumbProps}
    index={0}
    class="border-primary bg-background ring-ring/50 block size-4 shrink-0 rounded-full border shadow-sm transition-[box-shadow] outline-none hover:ring-3 focus-visible:ring-3 data-[disabled]:pointer-events-none"
  >
    {#snippet child({ props })}
      <span
        {...props}
        {...thumbProps}
        class={cn(typeof props.class === 'string' ? props.class : undefined, thumbProps.class)}
      ></span>
    {/snippet}
  </SliderPrimitive.Thumb>
</SliderPrimitive.Root>
