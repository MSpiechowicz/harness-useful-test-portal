import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Tauri loads the bundle from disk: one SPA shell, no server, relative-free root-absolute asset URLs.
    adapter: adapter({ pages: 'build', assets: 'build', fallback: 'index.html', strict: true }),
    paths: { relative: false },
  },
};

export default config;
