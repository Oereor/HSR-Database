<script lang="ts">
  export let label: string;
  export let campId: string | undefined = undefined;
</script>

<span
  class="enemy-identity-tag"
  class:enemy-rank-tag={campId === undefined}
  data-enemy-rank-label={campId === undefined ? label : undefined}
  data-enemy-camp-id={campId}>{label}</span
>

<style>
  .enemy-identity-tag {
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    background: color-mix(in srgb, var(--background) 72%, transparent);
    padding: 0.45rem 0.75rem;
    color: var(--gold-soft);
    font-size: var(--font-helper);
    font-weight: 500;
  }
</style>
