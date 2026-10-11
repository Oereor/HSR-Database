import { validateSiteMessageFiles } from './scripts/messages.js';
import { validateChangelogFiles } from './scripts/changelog.js';
import messageOptions from './paraglide.config.js';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { localPlayerMock, playerMockEnabled } from './scripts/dev/player-mock.js';

export default defineConfig(({ command, mode, isPreview }) => ({
  plugins: [
    ...(!isPreview && playerMockEnabled(command, mode, process.env)
      ? [
          localPlayerMock(
            process.env.PLAYER_MOCK_DIR ??
              (() => {
                throw new Error('PLAYER_MOCK_DIR required');
              })()
          )
        ]
      : []),
    {
      name: 'changelog-content-contract',
      async buildStart() {
        await validateChangelogFiles();
      },
      async handleHotUpdate(context) {
        if (context.file.replaceAll('\\', '/').includes('/src/lib/content/changelog/'))
          await validateChangelogFiles();
      }
    },
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
}));
