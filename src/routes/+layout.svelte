<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import '@fontsource-variable/inter';
  import '@fontsource-variable/jetbrains-mono';
  import '../app.css';
  import Footer from '$lib/components/layout/Footer.svelte';
  import Header from '$lib/components/layout/Header.svelte';
  import SkipLink from '$lib/components/layout/SkipLink.svelte';
  import { loadCatalog } from '$lib/content/load';
  import { initHistory } from '$lib/history/history.svelte';
  import { setLocale } from '$lib/i18n';
  import { initResume } from '$lib/quiz/session.svelte';
  import { initSettings, settingsState } from '$lib/settings/settings.svelte';
  import { browserStorage } from '$lib/settings/storage';
  import { checkOnStartup } from '$lib/shell/update.svelte';
  import { resolveTheme, writeThemeCache } from '$lib/theme/theme';
  import { themeState } from '$lib/theme/theme.svelte';

  let { children }: { children: Snippet } = $props();

  const language = $derived(settingsState.value.language);
  const theme = $derived(settingsState.value.theme);

  // Set the language before the template re-renders; the key below rebuilds the tree in the new one.
  $effect.pre(() => {
    document.documentElement.lang = setLocale(language);
  });

  // Wait for the saved settings: applying the defaults first would flash the wrong theme and overwrite the cache.
  $effect(() => {
    if (!settingsState.loaded) return;

    const preference = theme;
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)');

    function apply() {
      themeState.resolved = resolveTheme(preference, prefersLight.matches);
      document.documentElement.dataset.theme = themeState.resolved;
    }

    apply();
    writeThemeCache(browserStorage(), preference);

    if (preference !== 'system') return;

    prefersLight.addEventListener('change', apply);

    return () => prefersLight.removeEventListener('change', apply);
  });

  onMount(async () => {
    await initSettings();

    // Messages made while loading (notices) are written in the language the settings ask for.
    setLocale(settingsState.value.language);

    await initHistory();
    void initResume(loadCatalog());
    checkOnStartup();
  });
</script>

{#key language}
  <SkipLink />
  <Header />
  <main id="main" tabindex="-1">
    {#if settingsState.loaded}
      {@render children()}
    {/if}
  </main>
  <Footer />
{/key}

<style>
  main {
    flex: 1 0 auto;
  }

  main:focus {
    outline: none;
  }
</style>
