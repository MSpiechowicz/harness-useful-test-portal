<script lang="ts">
  import ConfirmDialog from '$lib/components/quiz/ConfirmDialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import CheckboxGroup from '$lib/components/ui/CheckboxGroup.svelte';
  import NumberField from '$lib/components/ui/NumberField.svelte';
  import ProgressBar from '$lib/components/ui/ProgressBar.svelte';
  import Segmented from '$lib/components/ui/Segmented.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import Toggle from '$lib/components/ui/Toggle.svelte';
  import { loadCatalog } from '$lib/content/load';
  import { DIFFICULTIES } from '$lib/content/schema';
  import { availableLocales, LOCALE_NAMES, t, tn } from '$lib/i18n';
  import { filterPool } from '$lib/quiz/select';
  import { pruneTopics, SETTINGS_BOUNDS, TEST_STYLES, type TestStyle } from '$lib/settings/schema';
  import { resetSettings, settingsState, updateSettings } from '$lib/settings/settings.svelte';
  import { isShell } from '$lib/shell/shell';
  import { checkUpdate, downloadFraction, installText, installUpdate, updater } from '$lib/shell/update.svelte';
  import { THEMES, type ThemePreference } from '$lib/theme/theme';

  const catalog = loadCatalog();
  const allIds = catalog.topics.map((topic) => topic.id);
  const inShell = isShell();

  const settings = $derived(settingsState.value);
  const selectedTopics = $derived(pruneTopics(settings.topics, allIds));
  const pool = $derived(filterPool(catalog.questions, { ...settings, topics: selectedTopics }));

  // The count follows the pool (never below the allowed minimum) so the field cannot promise more than exists.
  const countMax = $derived(Math.min(SETTINGS_BOUNDS.questionCount.max, Math.max(SETTINGS_BOUNDS.questionCount.min, pool.length)));
  const countHint = $derived(
    settings.questionCount > pool.length && pool.length > 0
      ? `${tn(pool.length, 'settings.availableOne', 'settings.availableMany')} ${t('settings.usesAll', { count: pool.length })}`
      : tn(pool.length, 'settings.availableOne', 'settings.availableMany'),
  );

  const topicsText = $derived(
    selectedTopics.length === 0
      ? t('settings.allTopics')
      : t('settings.someTopics', { selected: selectedTopics.length, total: allIds.length }),
  );

  const styleOptions = $derived(
    TEST_STYLES.map((value) => ({ value, label: t(`settings.style.${value}`), sub: t(`settings.styleHint.${value}`) })),
  );
  const themeOptions = $derived(
    THEMES.map((value) => ({
      value,
      label: t(`settings.themeOption.${value}`),
      sub: value === 'system' ? t('settings.themeHint.system') : undefined,
    })),
  );
  const difficultyOptions = $derived(DIFFICULTIES.map((value) => ({ value, label: t(`difficulty.${value}`) })));
  const languageOptions = $derived(availableLocales().map((code) => ({ value: code, label: LOCALE_NAMES[code] })));

  let confirmingReset = $state(false);

  function confirmReset() {
    confirmingReset = false;
    resetSettings();
  }

  const fraction = $derived(downloadFraction());
  const busy = $derived(updater.status === 'checking' || updater.installing);

  const updateText = $derived.by(() => {
    if (updater.status === 'checking') return t('update.checking');
    if (updater.status === 'current') return t('update.upToDate');
    if (updater.status === 'available' && updater.info)
      return t('update.available', { version: updater.info.version, current: updater.info.currentVersion });
    if (updater.status === 'unsupported') return t('update.unsupported');
    if (updater.status === 'error') return t('update.checkFailed', { error: updater.message ?? '' });

    return null;
  });
</script>

<svelte:head><title>{t('nav.settings')} · {t('app.name')}</title></svelte:head>

<div class="container page">
  <header>
    <p class="eyebrow">$ harness test --config</p>
    <h1>{t('settings.title')}</h1>
    <p class="lead">{t('settings.lead')}</p>
  </header>

  {#if settingsState.loadError}
    <p class="error" role="alert">{t('settings.loadFailed', { error: settingsState.loadError })}</p>
  {/if}

  <Card title={t('settings.testSection')} headingId="test-title">
    <div class="stack">
      <NumberField
        label={t('settings.questionCount')}
        value={settings.questionCount}
        min={SETTINGS_BOUNDS.questionCount.min}
        max={countMax}
        hint={countHint}
        onchange={(questionCount) => updateSettings({ questionCount })}
      />

      <NumberField
        label={t('settings.timer')}
        value={settings.timerMinutes}
        min={SETTINGS_BOUNDS.timerMinutes.min}
        max={SETTINGS_BOUNDS.timerMinutes.max}
        step={5}
        unit={t('settings.minutesUnit')}
        hint={t('settings.timerHint')}
        onchange={(timerMinutes) => updateSettings({ timerMinutes })}
      />

      <div class="field">
        <span class="label">{t('settings.testStyle')}</span>
        <Segmented
          label={t('settings.testStyle')}
          options={styleOptions}
          value={settings.testStyle}
          onchange={(testStyle: TestStyle) => updateSettings({ testStyle })}
        />
      </div>

      <CheckboxGroup
        legend={t('settings.difficulties')}
        options={difficultyOptions}
        selected={settings.difficulties}
        hint={t('settings.difficultiesHint')}
        onchange={(selected) => updateSettings({ difficulties: selected as (typeof DIFFICULTIES)[number][] })}
      />

      <div class="field">
        <span class="label">{t('settings.topics')}</span>
        <p class="topics-line">
          {topicsText}
          <Button variant="ghost" size="sm" href="/">{t('settings.changeTopics')}</Button>
        </p>
      </div>
    </div>
  </Card>

  <Card title={t('settings.appearanceSection')} headingId="appearance-title">
    <div class="field">
      <span class="label">{t('settings.theme')}</span>
      <Segmented
        label={t('settings.theme')}
        options={themeOptions}
        value={settings.theme}
        onchange={(theme: ThemePreference) => updateSettings({ theme })}
      />
    </div>
  </Card>

  <Card title={t('settings.behaviourSection')} headingId="behaviour-title">
    <div class="stack">
      <Toggle
        label={t('settings.shuffleQuestions')}
        description={t('settings.shuffleQuestionsHint')}
        checked={settings.shuffleQuestions}
        onchange={(shuffleQuestions) => updateSettings({ shuffleQuestions })}
      />
      <Toggle
        label={t('settings.shuffleOptions')}
        description={t('settings.shuffleOptionsHint')}
        checked={settings.shuffleOptions}
        onchange={(shuffleOptions) => updateSettings({ shuffleOptions })}
      />
      <Select
        label={t('settings.language')}
        value={settings.language}
        options={languageOptions}
        onchange={(language) => updateSettings({ language })}
      />
    </div>
  </Card>

  {#if inShell}
    <Card title={t('settings.updatesSection')} headingId="updates-title">
      <div class="stack">
        <Toggle
          label={t('settings.checkForUpdates')}
          description={t('settings.checkForUpdatesHint')}
          checked={settings.checkForUpdates}
          onchange={(checkForUpdates) => updateSettings({ checkForUpdates })}
        />

        <div class="update-actions">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || updater.status === 'unsupported' || updater.status === 'installed'}
            onclick={() => checkUpdate(true)}
          >
            {t('update.checkNow')}
          </Button>
          {#if updater.status === 'available' && !updater.installing}
            <Button size="sm" onclick={installUpdate}>{t('update.install')}</Button>
          {/if}
        </div>

        <p class="status" role="status">{updateText ?? ''}</p>

        {#if updater.installing}
          <div class="progress">
            <ProgressBar label={t('update.progress')} value={fraction === null ? null : fraction * 100} valueText={installText()} />
            <p class="status" role="status">{installText()}</p>
          </div>
        {/if}

        {#if updater.message}<p class="status" role="status">{updater.message}</p>{/if}
      </div>
    </Card>
  {/if}

  <div class="footer-row">
    <Button variant="secondary" disabled={settingsState.loadError !== null} onclick={() => (confirmingReset = true)}>
      {t('settings.reset')}
    </Button>
    <p class="status" role="status">
      {#if settingsState.saveError}
        <span class="error">{t('settings.saveFailed', { error: settingsState.saveError })}</span>
      {:else if settingsState.savedAt}
        {t('settings.saved')}
      {/if}
    </p>
  </div>
</div>

<ConfirmDialog
  open={confirmingReset}
  title={t('settings.resetConfirmTitle')}
  body={t('settings.resetConfirmBody')}
  confirmLabel={t('settings.resetConfirmConfirm')}
  cancelLabel={t('settings.resetConfirmCancel')}
  tone="danger"
  onconfirm={confirmReset}
  oncancel={() => (confirmingReset = false)}
/>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 24px;
    max-width: 860px;
    padding-block: 48px 64px;
  }

  .eyebrow {
    margin-bottom: 12px;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--accent);
  }

  h1 {
    font-family: var(--font-mono);
    font-size: clamp(28px, 3.4vw, 40px);
    letter-spacing: -0.04em;
    color: var(--text-strong);
  }

  .lead {
    margin-top: 12px;
    color: var(--muted);
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .label {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--muted);
  }

  .topics-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    color: var(--text);
  }

  .update-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .progress {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 420px;
  }

  .status {
    min-height: 1.5em;
    font-size: 14px;
    color: var(--muted);
  }

  .error {
    color: var(--danger);
  }

  .footer-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 20px;
  }
</style>
