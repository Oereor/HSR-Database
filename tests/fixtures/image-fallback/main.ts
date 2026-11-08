import { hydrate, mount } from 'svelte';
import AssetImage from '$lib/components/shared/AssetImage.svelte';
import ImageFixture from './ImageFixture.svelte';

const target = document.getElementById('app')!;
const hydrateButton = document.getElementById('hydrate');
if (location.pathname === '/phase-hp') {
  void import('./PhaseHpFixture.svelte').then(({ default: PhaseHpFixture }) =>
    mount(PhaseHpFixture, { target })
  );
} else if (location.pathname === '/description-text') {
  void import('./DescriptionFixture.svelte').then(({ default: DescriptionFixture }) => {
    hydrateButton!.addEventListener('click', () => hydrate(DescriptionFixture, { target }), {
      once: true
    });
  });
} else if (location.pathname === '/slider') {
  void import('./SliderFixture.svelte').then(({ default: SliderFixture }) =>
    mount(SliderFixture, { target })
  );
} else if (location.pathname === '/trace-grid') {
  void import('./TraceGridFixture.svelte').then(({ default: TraceGridFixture }) =>
    mount(TraceGridFixture, { target })
  );
} else if (hydrateButton) {
  hydrateButton.addEventListener(
    'click',
    () => {
      hydrate(AssetImage, { target, props: { src: '/broken.png', alt: 'Synthetic entity' } });
    },
    { once: true }
  );
} else {
  mount(ImageFixture, { target });
}
