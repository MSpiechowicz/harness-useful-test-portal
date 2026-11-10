<script lang="ts">
  import { splitInline } from '$lib/content/inline';

  let { text }: { text: string } = $props();

  const segments = $derived(splitInline(text));
</script>

<!-- Text nodes only (no {@html}): `backticks` become <code>, everything else stays inert text. -->
{#each segments as segment, index (index)}{#if segment.code}<code class="inline-code">{segment.text}</code>{:else}{segment.text}{/if}{/each}
