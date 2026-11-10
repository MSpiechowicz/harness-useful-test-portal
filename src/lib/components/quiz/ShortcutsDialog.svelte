<script lang="ts">
  import { t } from '$lib/i18n';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  const uid = $props.id();
  const titleId = `shortcuts-title-${uid}`;
  const noteId = `shortcuts-note-${uid}`;

  /** Each row lists alternative key combinations; the keys of one combination are pressed together. */
  const rows: { label: () => string; combos: string[][] }[] = [
    { label: () => t('quiz.shortcuts.option'), combos: [['1–9']] },
    { label: () => t('quiz.shortcuts.optionTrueFalse'), combos: [['1'], ['2']] },
    { label: () => t('quiz.shortcuts.next'), combos: [['n'], ['→']] },
    { label: () => t('quiz.shortcuts.previous'), combos: [['p'], ['←']] },
    { label: () => t('quiz.shortcuts.flag'), combos: [['f']] },
    { label: () => t('quiz.shortcuts.check'), combos: [['c']] },
    {
      label: () => t('quiz.shortcuts.submit'),
      combos: [
        ['Ctrl', 'Enter'],
        ['⌘', 'Enter'],
      ],
    },
    { label: () => t('quiz.shortcuts.help'), combos: [['?']] },
  ];

  let dialog: HTMLDialogElement | undefined = $state();

  // The native modal <dialog> traps focus, restores it on close and handles Escape.
  $effect(() => {
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  function onbackdrop(event: MouseEvent) {
    if (event.target === dialog) onclose();
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby={titleId}
  aria-describedby={noteId}
  oncancel={(event) => {
    event.preventDefault();
    onclose();
  }}
  onclick={onbackdrop}
>
  <h2 id={titleId}>{t('quiz.shortcuts.title')}</h2>
  <p id={noteId} class="note">{t('quiz.shortcuts.note')}</p>

  <ul>
    {#each rows as row (row.combos.join())}
      <li>
        <span class="keys">
          {#each row.combos as combo, position (position)}
            {#if position > 0}<span class="or" aria-hidden="true">/</span>{/if}
            <span class="combo">
              {#each combo as key, keyIndex (keyIndex)}<kbd>{key}</kbd>{/each}
            </span>
          {/each}
        </span>
        <span class="label">{row.label()}</span>
      </li>
    {/each}
  </ul>

  <div class="actions">
    <!-- svelte-ignore a11y_autofocus -->
    <button type="button" class="close" autofocus onclick={onclose}>{t('quiz.shortcuts.close')}</button>
  </div>
</dialog>

<style>
  dialog {
    width: min(520px, calc(100vw - 32px));
    padding: 24px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-xl);
    background: var(--panel);
    color: var(--text);
    box-shadow: var(--shadow-frame);
  }

  dialog::backdrop {
    background: var(--overlay);
  }

  h2 {
    font-family: var(--font-mono);
    font-size: 18px;
    color: var(--text-strong);
  }

  .note {
    margin-top: 10px;
    line-height: 1.6;
    color: var(--muted);
  }

  ul {
    display: flex;
    flex-direction: column;
    margin: 16px 0 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    align-items: baseline;
    gap: 16px;
    padding: 9px 0;
    border-top: 1px solid var(--border-soft);
    font-size: 14px;
  }

  .keys {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .combo {
    display: inline-flex;
    gap: 4px;
  }

  .or {
    color: var(--subtle);
  }

  .label {
    color: var(--text);
  }

  kbd {
    min-width: 22px;
    padding: 1px 6px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--panel-alt);
    font-size: 12px;
    line-height: 1.5;
    text-align: center;
    color: var(--text-strong);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
  }

  .close {
    padding: 14px 20px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 14px;
    line-height: 1.2;
    transition:
      border-color 0.15s,
      color 0.15s;
  }

  .close:hover {
    border-color: var(--accent);
    color: var(--text-strong);
  }

  @media (max-width: 520px) {
    li {
      grid-template-columns: minmax(0, 1fr);
      gap: 4px;
    }
  }
</style>
