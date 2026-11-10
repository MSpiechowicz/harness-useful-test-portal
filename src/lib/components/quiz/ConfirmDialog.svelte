<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';

  interface Props {
    open: boolean;
    title: string;
    body: string;
    confirmLabel: string;
    cancelLabel: string;
    /** `danger` styles the confirm button for actions that discard something. */
    tone?: 'primary' | 'danger';
    onconfirm: () => void;
    oncancel: () => void;
  }

  let { open, title, body, confirmLabel, cancelLabel, tone = 'primary', onconfirm, oncancel }: Props = $props();

  const uid = $props.id();
  const titleId = `dialog-title-${uid}`;
  const bodyId = `dialog-body-${uid}`;

  let dialog: HTMLDialogElement | undefined = $state();

  // The native modal <dialog> traps focus, restores it on close and handles Escape.
  $effect(() => {
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  function onbackdrop(event: MouseEvent) {
    if (event.target === dialog) oncancel();
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby={titleId}
  aria-describedby={bodyId}
  oncancel={(event) => {
    event.preventDefault();
    oncancel();
  }}
  onclick={onbackdrop}
>
  <h2 id={titleId}>{title}</h2>
  <p id={bodyId}>{body}</p>

  <div class="actions">
    <!-- svelte-ignore a11y_autofocus -->
    <button type="button" class="cancel" autofocus onclick={oncancel}>{cancelLabel}</button>
    <Button variant={tone === 'danger' ? 'danger' : 'primary'} onclick={onconfirm}>{confirmLabel}</Button>
  </div>
</dialog>

<style>
  dialog {
    width: min(460px, calc(100vw - 32px));
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

  p {
    margin-top: 10px;
    line-height: 1.6;
    color: var(--muted);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
  }

  .cancel {
    padding: 14px 20px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 14px;
    line-height: 1.2;
  }

  .cancel:hover {
    border-color: var(--accent);
    color: var(--text-strong);
  }
</style>
