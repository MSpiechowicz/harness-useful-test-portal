import type { Answer } from './score';
import type { QuizQuestion } from './select';

/** What a key press asks the quiz to do. `option.index` is zero-based. */
export type ShortcutAction =
  | { type: 'option'; index: number }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'flag' }
  | { type: 'check' }
  | { type: 'submit' }
  | { type: 'help' };

/** The parts of a KeyboardEvent (and its target) the shortcuts look at, so tests can pass plain objects. */
export interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
  target: { tag: string; type?: string; editable?: boolean };
}

const NON_TEXT_INPUT_TYPES = new Set(['radio', 'checkbox', 'button', 'submit', 'reset']);
const CHOICE_INPUT_TYPES = new Set(['radio', 'checkbox']);
const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight']);

/** Describes a DOM event target for `shortcutFor`. */
export function describeTarget(target: EventTarget | null): ShortcutEvent['target'] {
  if (!(target instanceof HTMLElement)) return { tag: '', editable: false };

  return {
    tag: target.tagName.toLowerCase(),
    type: target instanceof HTMLInputElement ? target.type : undefined,
    editable: target.isContentEditable,
  };
}

function isTextField(target: ShortcutEvent['target']): boolean {
  if (target.editable) return true;

  const tag = target.tag.toLowerCase();

  if (tag === 'input') return !NON_TEXT_INPUT_TYPES.has((target.type ?? '').toLowerCase());

  return tag === 'textarea' || tag === 'select';
}

/**
 * The action a key press means, or null to leave it alone: while a dialog is open, in a text field, with a
 * modifier held (Ctrl/Cmd+Enter submits), while a key repeats, and for arrows on a focused radio, checkbox or code block.
 */
export function shortcutFor(event: ShortcutEvent, dialogOpen: boolean): ShortcutAction | null {
  if (dialogOpen || event.repeat || isTextField(event.target)) return null;

  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.altKey) return { type: 'submit' };
  if (event.ctrlKey || event.metaKey || event.altKey) return null;

  if (ARROW_KEYS.has(event.key)) {
    // Arrows move between native radios and scroll a focused code block.
    if (CHOICE_INPUT_TYPES.has((event.target.type ?? '').toLowerCase())) return null;
    if (event.target.tag.toLowerCase() === 'pre') return null;
  }

  if (/^[1-9]$/.test(event.key)) return { type: 'option', index: Number(event.key) - 1 };

  switch (event.key) {
    case 'ArrowRight':
      return { type: 'next' };
    case 'ArrowLeft':
      return { type: 'previous' };
    case '?':
      return { type: 'help' };
  }

  switch (event.key.toLowerCase()) {
    case 'n':
      return { type: 'next' };
    case 'p':
      return { type: 'previous' };
    case 'f':
      return { type: 'flag' };
    case 'c':
      return { type: 'check' };
    default:
      return null;
  }
}

/**
 * The answer after pressing option number `index + 1`: a single question selects it, a multi question toggles it
 * (undefined once nothing is left selected) and true-false reads 1 as True and 2 as False. 'none' when there is
 * no such option, so the key does nothing.
 */
export function optionAnswer(entry: QuizQuestion, current: Answer | undefined, index: number): Answer | undefined | 'none' {
  if (!Number.isInteger(index) || index < 0) return 'none';

  if (entry.question.type === 'true-false') {
    if (index > 1) return 'none';

    return index === 0;
  }

  const option = entry.options[index];

  if (!option) return 'none';

  if (entry.question.type === 'single') return [option.id];

  const chosen = new Set(Array.isArray(current) ? current : []);

  if (chosen.has(option.id)) chosen.delete(option.id);
  else chosen.add(option.id);

  const next = entry.options.map((item) => item.id).filter((id) => chosen.has(id));

  return next.length > 0 ? next : undefined;
}
