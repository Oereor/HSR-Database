import { render } from 'svelte/server';
import AssetImage from '$lib/components/shared/AssetImage.svelte';

export function renderImage() {
  return render(AssetImage, { props: { src: '/broken.png', alt: 'Synthetic entity' } });
}
