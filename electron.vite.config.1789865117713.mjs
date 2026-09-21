// electron.vite.config.ts
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { sveltekit } from "@sveltejs/kit/vite";
var __electron_vite_injected_dirname = "C:\\_C-FILES\\www\\chiv-admin-tool\\frontend";
var skipRendererBuild = process.env.CHIV_SKIP_ELECTRON_RENDERER === "1";
var sharedAlias = { "@spellbook/shared": resolve(__electron_vite_injected_dirname, "packages/shared/src") };
var rendererWatchIgnored = [
  "**/.git/**",
  "**/.svelte-kit/**",
  "**/bin/**",
  "**/logs/**",
  "**/node_modules/**",
  "**/obj/**",
  "**/out/**",
  "**/release/**",
  "**/src/core/**"
];
var electron_vite_config_default = defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    plugins: [externalizeDepsPlugin({ exclude: ["openapi-fetch", "any-ascii"] })],
    build: {
      rollupOptions: {
        input: resolve(__electron_vite_injected_dirname, "src/app/main/index.ts")
      }
    }
  },
  preload: {
    resolve: { alias: sharedAlias },
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: resolve(__electron_vite_injected_dirname, "src/app/preload/index.ts")
      }
    }
  },
  ...skipRendererBuild ? {} : {
    renderer: {
      root: resolve(__electron_vite_injected_dirname),
      resolve: { alias: sharedAlias },
      plugins: [sveltekit()],
      server: {
        // strictPort keeps a stale dev server from silently drifting to another port.
        port: 5173,
        strictPort: true,
        fs: {
          allow: [resolve(__electron_vite_injected_dirname, "packages/shared/src")]
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
  }
});
export {
  electron_vite_config_default as default
};
