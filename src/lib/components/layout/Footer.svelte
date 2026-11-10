<script lang="ts">
  import ExternalLink from '$lib/components/ui/ExternalLink.svelte';
  import { t } from '$lib/i18n';

  const REPO = 'https://github.com/MSpiechowicz/harness-useful-test-portal';
  const year = new Date().getFullYear();
</script>

<footer class="site-footer">
  <div class="container inner">
    <p class="tagline">{t('layout.tagline')}</p>
    <p>
      <small>
        © {year} Harness Useful · GPL-3.0-or-later · {t('layout.privacy')} ·
        <ExternalLink url={REPO}>{t('layout.source')}</ExternalLink>
      </small>
    </p>
  </div>
</footer>

<style>
  .site-footer {
    margin-top: auto;
    border-top: 1px solid var(--border-soft);
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--subtle);
  }

  .inner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 48px;
    padding-block: 24px;
  }

  .tagline {
    color: var(--muted);
  }
</style>
