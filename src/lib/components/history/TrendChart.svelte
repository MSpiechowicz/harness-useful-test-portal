<script lang="ts" module>
  /** A date and time in the user's language; an unknown language tag falls back to the system default. */
  export function formatDateTime(ms: number, language: string): string {
    const options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };

    // Stored times are untrusted: one outside what a Date can hold must not break the page.
    if (!Number.isFinite(new Date(ms).getTime())) return '—';

    try {
      return new Intl.DateTimeFormat(language, options).format(ms);
    } catch {
      return new Intl.DateTimeFormat(undefined, options).format(ms);
    }
  }
</script>

<script lang="ts">
  import { t } from '$lib/i18n';
  import { sparklinePoints } from '$lib/history/stats';
  import type { QuizMode } from '$lib/quiz/state';
  import { settingsState } from '$lib/settings/settings.svelte';

  interface Props {
    /** Oldest first. */
    points: { id: string; finishedAt: number; percent: number; mode: QuizMode }[];
  }

  let { points }: Props = $props();

  // The plot area inside the viewBox, leaving room on the left for the percentage labels.
  const WIDTH = 640;
  const HEIGHT = 220;
  const LEFT = 44;
  const RIGHT = 12;
  const TOP = 14;
  const BOTTOM = 14;
  const PLOT_WIDTH = WIDTH - LEFT - RIGHT;
  const PLOT_HEIGHT = HEIGHT - TOP - BOTTOM;
  const GRID = [100, 50, 0];

  const language = $derived(settingsState.value.language);
  const enough = $derived(points.length >= 2);
  const line = $derived(
    sparklinePoints(
      points.map((point) => point.percent),
      PLOT_WIDTH,
      PLOT_HEIGHT,
    ),
  );
  const dots = $derived(
    line === ''
      ? []
      : line.split(' ').map((pair, index) => {
          const [x, y] = pair.split(',').map(Number);

          return { x, y, point: points[index] };
        }),
  );
  const hasPractice = $derived(points.some((point) => point.mode === 'practice'));
  const hasExam = $derived(points.some((point) => point.mode === 'exam'));

  const label = $derived(`${t('history.trend')}: ${points.map((point) => t('history.percent', { percent: point.percent })).join(', ')}`);

  function gridY(percent: number): number {
    return TOP + PLOT_HEIGHT - (percent / 100) * PLOT_HEIGHT;
  }
</script>

{#if !enough}
  <p class="empty">{t('history.trendEmpty')}</p>
{:else}
  <figure>
    <svg class="chart" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label={label}>
      {#each GRID as percent (percent)}
        <line class="grid" x1={LEFT} x2={WIDTH - RIGHT} y1={gridY(percent)} y2={gridY(percent)} />
        <text class="tick" x={LEFT - 8} y={gridY(percent)} text-anchor="end" dominant-baseline="central"
          >{t('history.percent', { percent })}</text
        >
      {/each}

      <g transform="translate({LEFT} {TOP})">
        <polyline class="line" points={line} fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        {#each dots as dot (dot.point.id)}
          <circle class="dot {dot.point.mode}" cx={dot.x} cy={dot.y} r="4.5" stroke-width="2" />
        {/each}
      </g>
    </svg>

    {#if hasExam && hasPractice}
      <figcaption class="legend" aria-hidden="true">
        <span class="key"><span class="swatch exam"></span>{t('results.mode.exam')}</span>
        <span class="key"><span class="swatch practice"></span>{t('results.mode.practice')}</span>
      </figcaption>
    {/if}

    <div class="visually-hidden">
      <table>
        <caption>{t('history.trendTable')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('history.col.date')}</th>
            <th scope="col">{t('history.col.mode')}</th>
            <th scope="col">{t('history.col.score')}</th>
          </tr>
        </thead>
        <tbody>
          {#each points as point (point.id)}
            <tr>
              <td>{formatDateTime(point.finishedAt, language)}</td>
              <td>{t(`results.mode.${point.mode}`)}</td>
              <td>{t('history.percent', { percent: point.percent })}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </figure>
{/if}

<style>
  figure {
    margin: 0;
  }

  .chart {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }

  .grid {
    stroke: var(--border);
    stroke-width: 1;
    stroke-dasharray: 3 4;
  }

  .tick {
    fill: var(--subtle);
    font-family: var(--font-mono);
    font-size: 11px;
  }

  .line {
    stroke: var(--accent);
  }

  .dot {
    stroke: var(--accent);
  }

  .dot.exam {
    fill: var(--accent);
  }

  .dot.practice {
    fill: var(--panel);
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    margin-top: 10px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--muted);
  }

  .key {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .swatch {
    width: 10px;
    height: 10px;
    border: 2px solid var(--accent);
    border-radius: 999px;
  }

  .swatch.exam {
    background: var(--accent);
  }

  .swatch.practice {
    background: var(--panel);
  }

  .empty {
    padding: 20px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-lg);
    color: var(--muted);
  }
</style>
