<script lang="ts">
  export let annotation: string;
</script>

<!-- WebKit forces native rt elements into normal flow. -->
<span class="game-text-ruby"
  ><span class="game-text-ruby__base"><slot /></span><span class="game-text-ruby__annotation"
    >{annotation}</span
  ></span
>

<style>
  .game-text-ruby {
    position: relative;
    display: inline-block;
    padding-block-start: 0.72em;
    white-space: nowrap;
    overflow-wrap: normal;
  }

  .game-text-ruby__annotation {
    position: absolute;
    inset-block-start: 0;
    left: 50%;
    inline-size: max-content;
    transform: translateX(-50%);
    font-size: 0.62em;
    line-height: 1;
  }
</style>
