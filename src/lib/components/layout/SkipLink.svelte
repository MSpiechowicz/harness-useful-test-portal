<script lang="ts">
  import { t } from '$lib/i18n';
</script>

<a class="skip-link" href="#main">{t('layout.skip')}</a>

<style>
  .skip-link {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 100;
    padding: 10px 16px;
    border-radius: var(--radius-md);
    background: var(--accent);
    color: var(--accent-ink);
    font-family: var(--font-mono);
    font-size: 14px;
    font-weight: 700;
    text-decoration: none;
    transform: translateY(-200%);
  }

  .skip-link:focus {
    transform: none;
    color: var(--accent-ink);
  }
</style>
