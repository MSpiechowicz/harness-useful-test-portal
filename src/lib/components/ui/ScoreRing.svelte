<script lang="ts" module>
  export type ScoreTone = 'accent' | 'warning' | 'danger';

  /** The colour a whole percentage is shown in: from 70 up is good, from 40 up is middling. */
  export function toneFor(percent: number): ScoreTone {
    if (percent >= 70) return 'accent';
    if (percent >= 40) return 'warning';

    return 'danger';
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';

  interface Props {
    /** Whole percentage, 0 to 100. */
    percent: number;
    tone?: ScoreTone;
    /** Accessible name, e.g. "Score 80%". */
    label: string;
    /** Width and height in pixels. */
    size?: number;
  }

  let { percent, tone = toneFor(percent), label, size = 168 }: Props = $props();

  const RADIUS = 52;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const clamped = $derived(Math.min(100, Math.max(0, percent)));

  // Starts empty and fills once mounted, so the ring draws itself in.
  let shown = $state(0);

  onMount(() => {
    shown = clamped;
  });

  const offset = $derived(CIRCUMFERENCE * (1 - shown / 100));
</script>

<svg class="ring {tone}" viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={label}>
  <circle class="track" cx="60" cy="60" r={RADIUS} fill="none" stroke-width="10" />
  <circle
    class="arc"
    cx="60"
    cy="60"
    r={RADIUS}
    fill="none"
    stroke-width="10"
    stroke-linecap="round"
    stroke-dasharray={CIRCUMFERENCE}
    style:stroke-dashoffset={offset}
    transform="rotate(-90 60 60)"
  />
  <text class="value" x="60" y="60" text-anchor="middle" dominant-baseline="central" aria-hidden="true"
    >{t('history.percent', { percent: clamped })}</text
  >
</svg>

<style>
  .ring {
    --stroke: var(--accent);

    display: block;
    flex: none;
    max-width: 100%;
    height: auto;
  }

  .warning {
    --stroke: var(--warning);
  }

  .danger {
    --stroke: var(--danger);
  }

  .track {
    stroke: var(--panel-alt);
  }

  .arc {
    stroke: var(--stroke);
    transition: stroke-dashoffset 0.8s ease-out;
  }

  .value {
    fill: var(--text-strong);
    font-family: var(--font-mono);
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.05em;
  }
</style>
