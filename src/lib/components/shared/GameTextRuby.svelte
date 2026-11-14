<script lang="ts">
  export let annotation: string;
</script>

<ruby class="game-text-ruby"
  ><span class="game-text-ruby__base"><slot /></span><rt>{annotation}</rt></ruby
>

<style>
  .game-text-ruby {
    position: relative;
    display: inline-block;
    padding-block-start: 0.72em;
    white-space: nowrap;
    overflow-wrap: normal;
  }

  rt {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 50%;
    display: block;
    transform: translateX(-50%);
    font-size: 0.62em;
    line-height: 1;
  }
</style>
