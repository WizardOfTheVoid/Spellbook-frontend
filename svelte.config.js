const path = require('node:path')

const staticAdapter = {
  name: '@sveltejs/adapter-static',
  async adapt(builder) {
    const { default: adapter } = await import('@sveltejs/adapter-static');

    await adapter({
      pages: 'out/renderer',
      assets: 'out/renderer',
      strict: false
    }).adapt(builder);
  }
};

// Prepended to every SCSS block so components get the shared functions without importing.
const stylesDir = path.join(__dirname, 'src/app/renderer/src/styles')
const sharedDir = path.join(__dirname, 'packages/shared/src')
const scssOptions = {
  api: 'modern',
  loadPaths: [stylesDir],
  additionalData: '@use "functions" as *;\n'
};

let vitePreprocessPromise;

function getVitePreprocess() {
  vitePreprocessPromise ??= import('@sveltejs/vite-plugin-svelte').then(({ vitePreprocess }) => vitePreprocess({
    style: {
      css: {
        preprocessorOptions: {
          scss: scssOptions
        }
      }
    }
  }));
  return vitePreprocessPromise;
}

const lazyVitePreprocess = {
  name: 'lazy-vite-preprocess',
  async markup(options) {
    return (await getVitePreprocess()).markup?.(options);
  },
  async script(options) {
    return (await getVitePreprocess()).script?.(options);
  },
  async style(options) {
    return (await getVitePreprocess()).style?.(options);
  }
};

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: lazyVitePreprocess,
  kit: {
    adapter: staticAdapter,
    appDir: '_app',
    alias: {
      '@spellbook/shared': sharedDir
    },
    files: {
      assets: 'src/app/renderer/static',
      appTemplate: 'src/app/renderer/src/app.html',
      lib: 'src/app/renderer/src/lib',
      routes: 'src/app/renderer/src/routes'
    },
    paths: {
      relative: true
    }
  }
};

module.exports = config;
