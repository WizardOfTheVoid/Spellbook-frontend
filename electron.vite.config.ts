import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { sveltekit } from '@sveltejs/kit/vite';

const skipRendererBuild = process.env.CHIV_SKIP_ELECTRON_RENDERER === '1';
const sharedAlias = { '@spellbook/shared': resolve(__dirname, 'packages/shared/src') }

// The renderer root is the workspace root so the SvelteKit plugin can find svelte.config.js,
// which would otherwise make the dev watcher crawl build output and .NET artifacts.
const rendererWatchIgnored = [
  '**/.git/**',
  '**/.svelte-kit/**',
  '**/bin/**',
  '**/logs/**',
  '**/node_modules/**',
  '**/obj/**',
  '**/out/**',
  '**/release/**',
  '**/src/core/**'
];

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    plugins: [externalizeDepsPlugin({ exclude: ['openapi-fetch'] })],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/app/main/index.ts')
      }
    }
  },
  preload: {
    resolve: { alias: sharedAlias },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/app/preload/index.ts')
      }
    }
  },
  ...(skipRendererBuild
    ? {}
    : {
        renderer: {
          root: resolve(__dirname),
          resolve: { alias: sharedAlias },
          plugins: [sveltekit()],
          server: {
            // strictPort keeps a stale dev server from silently drifting to another port.
            port: 5173,
            strictPort: true,
            fs: {
              allow: [resolve(__dirname, 'packages/shared/src')]
            },
            watch: {
              ignored: rendererWatchIgnored
            }
          },
          css: {
            preprocessorOptions: {
              scss: {}
            }
          }
        }
      })
});
