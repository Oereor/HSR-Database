import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias: { $lib: fileURLToPath(new URL('../../../src/lib', import.meta.url)) } },
  plugins: [
    tailwindcss(),
    svelte({ configFile: false }),
    {
      name: 'image-hydration-fixture',
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          if (request.url !== '/hydration' && request.url !== '/description-text') return next();
          try {
            const { renderImage, renderDescription } = await server.ssrLoadModule('/server.ts');
            const { body, head } =
              request.url === '/description-text' ? await renderDescription() : renderImage();
            const html = await server.transformIndexHtml(
              request.url,
              `<!doctype html>
              <html lang="en"><head><title>Hydration fixture</title>${head}</head>
              <body><div id="app">${body}</div><button id="hydrate">Hydrate</button>
              <script type="module" src="/main.ts"></script></body></html>`
            );
            response.setHeader('Content-Type', 'text/html');
            response.end(html);
          } catch (error) {
            next(error);
          }
        });
      }
    }
  ],
  server: { host: '127.0.0.1', port: 4175, strictPort: true }
});
