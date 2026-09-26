<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';

  let src: string | undefined = '/valid-a.svg';
  let decorative = false;
  let missing = false;
</script>

<label
  >Source
  <select bind:value={src}>
    <option value="/valid-a.svg">Valid A</option>
    <option value="/valid-b.svg">Valid B</option>
    <option value="/broken.png">Broken</option>
    <option value={undefined}>Missing</option>
    <option value=" ">Whitespace</option>
  </select>
</label>
<label><input type="checkbox" bind:checked={decorative} />Decorative</label>
<div class="stage" data-missing={missing}>
  <AssetImage
    {src}
    {decorative}
    alt="Synthetic entity"
    width={120}
    height={80}
    fallbackClass="fixture-fallback"
    bind:missing
  />
</div>

<style>
  .stage {
    width: 120px;
    height: 80px;
  }
  .stage :global(.fixture-fallback) {
    width: 120px;
    height: 80px;
  }
</style>
