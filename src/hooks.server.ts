import { paraglideMiddleware } from '$lib/paraglide/server.js';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ locale }) => {
    event.locals.locale = locale;
    return resolve(event, {
      transformPageChunk: ({ html }) => html.replace('%lang%', locale)
    });
  });
