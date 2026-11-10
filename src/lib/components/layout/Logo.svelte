<script lang="ts">
  interface Props {
    /** Rendered width in px; height follows the mark's 100:86 aspect ratio. */
    size?: number;
    /** Accessible name. Omit for a decorative mark (aria-hidden). */
    label?: string;
  }

  let { size = 28, label }: Props = $props();

  // The harness-useful family gradient.
  const GRADIENT = ['#2DD4A8', '#5EB3FF'] as const;

  // Unique per instance so several marks can share a page.
  const uid = $props.id();
  const gradientId = `logo-${uid}`;
  const height = $derived(Math.round(size * 0.86));
</script>

<svg
  viewBox="10 14 100 86"
  width={size}
  {height}
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
  focusable="false"
>
  <defs>
    <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="94" x2="0" y2="20">
      <stop offset="0" stop-color={GRADIENT[0]} />
      <stop offset="1" stop-color={GRADIENT[1]} />
    </linearGradient>
  </defs>
  <g fill="url(#{gradientId})">
    <path d="M18 20 H33 V50 H58 V20 H73 V64 H33 V94 H18 Z" transform="rotate(7 33 94)" />
    <path d="M58 64 H73 V94 H58 Z" transform="rotate(90 73 94)" />
  </g>
</svg>
