import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Prepended to every SCSS block so components get the shared functions without importing.
const stylesDir = fileURLToPath(new URL('./src/styles', import.meta.url));
const sharedDirectory = fileURLToPath(new URL('../../../packages/shared/src', import.meta.url))

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: {
      '@spellbook/shared': sharedDirectory
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern',
        loadPaths: [stylesDir],
        additionalData: '@use "functions" as *;\n'
      }
    }
  }
});
