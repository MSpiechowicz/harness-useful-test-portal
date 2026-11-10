<script lang="ts">
  import { page } from '$app/state';
  import Button from '$lib/components/ui/Button.svelte';
  import { t } from '$lib/i18n';
</script>

<svelte:head><title>{t('error.title')} · {t('app.name')}</title></svelte:head>

<div class="container wrap">
  <p class="eyebrow">$ {page.status}</p>
  <h1>{page.status === 404 ? t('error.notFound') : t('error.generic')}</h1>
  <p class="lead">{page.error?.message}</p>
  <Button href="/">{t('error.home')}</Button>
</div>

<style>
  .wrap {
    padding-block: 64px;
  }

  .eyebrow {
    margin-bottom: 16px;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--accent);
  }

  h1 {
    font-family: var(--font-mono);
    font-size: clamp(28px, 4vw, 44px);
    letter-spacing: -0.04em;
    color: var(--text-strong);
  }

  .lead {
    margin: 12px 0 28px;
    color: var(--muted);
  }
</style>
