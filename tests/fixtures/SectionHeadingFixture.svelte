<script lang="ts">
  import SectionHeading from '../../src/lib/components/SectionHeading.svelte';

  export let level: 1 | 2 | 3;
</script>

<SectionHeading {level} id={`heading-${level}`}>统一标题</SectionHeading>
