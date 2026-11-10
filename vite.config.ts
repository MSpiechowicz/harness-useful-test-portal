import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  build: {
    // Never inline assets: the CSP has no data: sources for styles or scripts.
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
