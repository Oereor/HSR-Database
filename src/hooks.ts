import { deLocalizeUrl } from '$lib/paraglide/runtime.js';
import type { Reroute } from '@sveltejs/kit';

export const reroute: Reroute = ({ url }) => deLocalizeUrl(url).pathname;
