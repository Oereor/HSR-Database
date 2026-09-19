<script lang="ts">
  import SectionHeading from '../../src/lib/components/shared/SectionHeading.svelte';

  export let level: 1 | 2 | 3;
</script>

<SectionHeading {level} id={`heading-${level}`}>synthetic section heading</SectionHeading>
