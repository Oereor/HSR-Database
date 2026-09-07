import { validateSiteMessageFiles } from './scripts/messages.js';
import messageOptions from './paraglide.config.js';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      name: 'site-message-contract',
      async buildStart() {
        await validateSiteMessageFiles();
      },
      async handleHotUpdate(context) {
        if (context.file.includes('/messages/') || context.file.includes('/project.inlang/'))
          await validateSiteMessageFiles();
      }
    },
    paraglideVitePlugin(messageOptions),
    tailwindcss(),
    sveltekit()
  ],
  server: {
    host: '127.0.0.1',
    port: 4174
  },
  preview: {
    host: '127.0.0.1'
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node'
  }
});
