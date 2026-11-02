import { expect, type Locator } from '@playwright/test';

/** Set the internal scalar (including index-based controls) using real keyboard input. */
export async function setSliderValue(slider: Locator, target: string | number) {
  const value = Number(target);
  const min = Number(await slider.getAttribute('data-slider-min'));
  const max = Number(await slider.getAttribute('data-slider-max'));
  const step = Number(await slider.getAttribute('data-slider-step'));
  await slider.focus();
  const fromEnd = max - value < value - min;
  await slider.press(fromEnd ? 'End' : 'Home');
  const count = Math.round(Math.abs(value - (fromEnd ? max : min)) / step);
  for (let i = 0; i < count; i += 1) await slider.press(fromEnd ? 'ArrowLeft' : 'ArrowRight');
  await expect(slider).toHaveAttribute('data-value', String(value));
}
