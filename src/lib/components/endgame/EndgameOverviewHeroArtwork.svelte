<script lang="ts">
  import EndgameModeIcon from './EndgameModeIcon.svelte';
  import type { EndgameMode } from '$lib/domain/endgame';

  const modes: EndgameMode[] = ['moc', 'pf', 'as', 'aa'];
</script>

<div class="endgame-hero-artwork">
  {#each modes as mode}
    <span class={`endgame-hero-artwork__icon endgame-hero-artwork__icon--${mode}`} data-mode={mode}>
      <EndgameModeIcon {mode} />
    </span>
  {/each}
</div>

<style>
  .endgame-hero-artwork {
    position: absolute;
    inset: 0;
    filter: saturate(0.82);
  }

  .endgame-hero-artwork::before {
    position: absolute;
    inset: 15% 3% 5% 8%;
    border-radius: 50%;
    background: radial-gradient(circle, rgb(109 128 198 / 14%), transparent 70%);
    content: '';
  }

  .endgame-hero-artwork__icon {
    position: absolute;
    display: grid;
    place-items: center;
    opacity: 0.5;
    filter: drop-shadow(0 0 18px currentColor);
  }

  .endgame-hero-artwork__icon--moc {
    right: 45%;
    bottom: 9%;
    font-size: 8.2rem;
    transform: rotate(-8deg);
  }

  .endgame-hero-artwork__icon--pf {
    right: 25%;
    bottom: -6%;
    z-index: 2;
    font-size: 10.5rem;
    opacity: 0.62;
    transform: rotate(7deg);
  }

  .endgame-hero-artwork__icon--as {
    right: 8%;
    bottom: 19%;
    font-size: 7.4rem;
    opacity: 0.43;
    transform: rotate(-4deg);
  }

  .endgame-hero-artwork__icon--aa {
    right: -7%;
    bottom: -16%;
    font-size: 8.8rem;
    opacity: 0.35;
    transform: rotate(10deg);
  }

  @media (max-width: 700px) {
    .endgame-hero-artwork {
      transform: translateX(7%);
    }

    .endgame-hero-artwork__icon--moc {
      right: 50%;
      font-size: 5.6rem;
    }

    .endgame-hero-artwork__icon--pf {
      right: 25%;
      font-size: 7rem;
    }

    .endgame-hero-artwork__icon--as {
      right: 7%;
      font-size: 5.1rem;
    }

    .endgame-hero-artwork__icon--aa {
      right: -13%;
      font-size: 6rem;
    }
  }
</style>
