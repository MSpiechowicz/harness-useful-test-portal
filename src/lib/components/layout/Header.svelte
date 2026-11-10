<script lang="ts">
  import { page } from '$app/state';
  import Button from '$lib/components/ui/Button.svelte';
  import Pill from '$lib/components/ui/Pill.svelte';
  import { t } from '$lib/i18n';
  import { updateSettings, settingsState } from '$lib/settings/settings.svelte';
  import { updater } from '$lib/shell/update.svelte';
  import { themeState } from '$lib/theme/theme.svelte';
  import Logo from './Logo.svelte';

  const pathname = $derived(page.url.pathname);
  const links = $derived([
    { href: '/', label: t('nav.home') },
    { href: '/history', label: t('nav.history') },
    { href: '/settings', label: t('nav.settings') },
  ]);

  const toLight = $derived(themeState.resolved === 'dark');

  /** Switches to the opposite of the theme on screen, as an explicit choice (leaves "system"). */
  function toggleTheme() {
    updateSettings({ theme: toLight ? 'light' : 'dark' });
  }

  function current(href: string): 'page' | undefined {
    return pathname === href ? 'page' : undefined;
  }
</script>

<header class="site-header">
  <div class="container bar">
    <a class="brand" href="/">
      <Logo />
      <span><span class="brand-dim">harness</span> test portal</span>
    </a>

    <nav aria-label={t('nav.main')}>
      <ul>
        {#each links as link (link.href)}
          <li><a href={link.href} aria-current={current(link.href)}>{link.label}</a></li>
        {/each}
        {#if updater.status === 'available' && updater.info}
          <li><Pill tone="accent" href="/settings">{t('update.pill', { version: updater.info.version })}</Pill></li>
        {/if}
        <!-- Only once the saved settings are in: toggling earlier would save the defaults over them. -->
        {#if settingsState.loaded}
          <li>
            <Button variant="secondary" size="sm" label={toLight ? t('theme.toLight') : t('theme.toDark')} onclick={toggleTheme}>
              <svg
                class="theme-icon"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                {#if toLight}
                  <circle cx="12" cy="12" r="4" />
                  <path
                    d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
                  />
                {:else}
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                {/if}
              </svg>
            </Button>
          </li>
        {/if}
      </ul>
    </nav>
  </div>
</header>

<style>
  .site-header {
    position: relative;
    z-index: 2;
    border-bottom: 1px solid var(--border-soft);
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-block: 16px;
    font-family: var(--font-mono);
    font-size: 14px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text);
    text-decoration: none;
  }

  .brand:hover {
    color: var(--text-strong);
  }

  .brand-dim {
    color: var(--subtle);
  }

  ul {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 22px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  nav a:not(:global(.pill)) {
    color: var(--muted);
    text-decoration: none;
  }

  nav a:not(:global(.pill)):hover,
  nav a[aria-current='page'] {
    color: var(--text-strong);
  }

  nav a[aria-current='page'] {
    text-decoration: underline;
    text-decoration-color: var(--accent);
    text-underline-offset: 6px;
  }
</style>
