<script lang="ts">
  export let label: string;
</script>

<span class="enemy-rank-tag" data-enemy-rank-label={label}>{label}</span>

<style>
  .enemy-rank-tag {
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    background: color-mix(in srgb, var(--background) 72%, transparent);
    padding: 0.45rem 0.75rem;
    color: var(--gold-soft);
    font-size: var(--font-helper);
    font-weight: 500;
  }
</style>
