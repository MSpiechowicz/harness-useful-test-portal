<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n';
  import { openUrl } from '$lib/shell/shell';

  interface Props {
    url: string;
    children: Snippet;
  }

  let { url, children }: Props = $props();

  async function open() {
    try {
      await openUrl(url);
    } catch (error) {
      // The backend refused the link (or there is no browser); nothing to recover, but never an unhandled rejection.
      console.warn('Could not open link', error);
    }
  }
</script>

<!-- A button, not an anchor: inside the app a link would navigate the webview, so the system browser opens it. -->
<button type="button" class="link" title={url} onclick={open}>
  {@render children()}<span class="visually-hidden"> {t('common.opensInBrowser')}</span>
</button>

<style>
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    text-align: left;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--accent) 40%, transparent);
    text-underline-offset: 3px;
  }

  .link:hover {
    color: var(--accent-hover);
    text-decoration-color: currentcolor;
  }
</style>
