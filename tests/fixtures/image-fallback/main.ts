import { hydrate, mount } from 'svelte';
import AssetImage from '$lib/components/shared/AssetImage.svelte';
import ImageFixture from './ImageFixture.svelte';

const target = document.getElementById('app')!;
const hydrateButton = document.getElementById('hydrate');
if (hydrateButton) {
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
