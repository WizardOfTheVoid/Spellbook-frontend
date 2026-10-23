import { defineConfig } from 'vite'
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'node:url'

const renderer = fileURLToPath(new URL(`../src/app/renderer`, import.meta.url))
const styles = fileURLToPath(new URL(`../src/app/renderer/src/styles`, import.meta.url))
export default defineConfig({
  root: renderer,
  publicDir: `static`,
  plugins: [svelte({ configFile: false, preprocess: vitePreprocess() })],
  resolve: { alias: { $lib: `${renderer}/src/lib`, '@spellbook/shared': fileURLToPath(new URL(`../packages/shared/src`, import.meta.url)), '$app/environment': fileURLToPath(new URL(`./dashboardPreviewEnvironment.ts`, import.meta.url)) } },
  css: { preprocessorOptions: { scss: { api: `modern`, loadPaths: [styles], additionalData: `@use "functions" as *;\n` } } },
  server: { host: `127.0.0.1`, port: 5184, strictPort: true },
})
