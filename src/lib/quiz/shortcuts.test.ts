import { describe, expect, test } from 'bun:test';
import { catalogQuestion } from '../content/__fixtures__/samples';
import { prepareQuiz } from './select';
import { optionAnswer, shortcutFor, type ShortcutEvent } from './shortcuts';

function press(key: string, extra: Partial<ShortcutEvent> = {}): ShortcutEvent {
  return { key, ctrlKey: false, metaKey: false, altKey: false, repeat: false, target: { tag: 'body' }, ...extra };
}

describe('shortcutFor: keys', () => {
  test('digits 1 to 9 pick option 0 to 8', () => {
    for (let digit = 1; digit <= 9; digit += 1) {
      expect(shortcutFor(press(String(digit)), false)).toEqual({ type: 'option', index: digit - 1 });
    }

    expect(shortcutFor(press('0'), false)).toBeNull();
  });

  test('navigation, flag, check and help', () => {
    expect(shortcutFor(press('n'), false)).toEqual({ type: 'next' });
    expect(shortcutFor(press('ArrowRight'), false)).toEqual({ type: 'next' });
    expect(shortcutFor(press('p'), false)).toEqual({ type: 'previous' });
    expect(shortcutFor(press('ArrowLeft'), false)).toEqual({ type: 'previous' });
    expect(shortcutFor(press('f'), false)).toEqual({ type: 'flag' });
    expect(shortcutFor(press('c'), false)).toEqual({ type: 'check' });
    expect(shortcutFor(press('?'), false)).toEqual({ type: 'help' });
  });

  test('letters work with caps lock or shift', () => {
    expect(shortcutFor(press('N'), false)).toEqual({ type: 'next' });
    expect(shortcutFor(press('F'), false)).toEqual({ type: 'flag' });
  });

  test('Ctrl or Cmd with Enter submits', () => {
    expect(shortcutFor(press('Enter', { ctrlKey: true }), false)).toEqual({ type: 'submit' });
    expect(shortcutFor(press('Enter', { metaKey: true }), false)).toEqual({ type: 'submit' });
    expect(shortcutFor(press('Enter'), false)).toBeNull();
    expect(shortcutFor(press('Enter', { ctrlKey: true, altKey: true }), false)).toBeNull();
  });

  test('other keys are left alone', () => {
    for (const key of ['a', 'x', ' ', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown']) expect(shortcutFor(press(key), false)).toBeNull();
  });
});

describe('shortcutFor: ignore rules', () => {
  test('nothing fires while a dialog is open', () => {
    expect(shortcutFor(press('n'), true)).toBeNull();
    expect(shortcutFor(press('Enter', { ctrlKey: true }), true)).toBeNull();
  });

  test('nothing fires in a text field', () => {
    for (const target of [
      { tag: 'input', type: 'text' },
      { tag: 'input' },
      { tag: 'textarea' },
      { tag: 'select' },
      { tag: 'div', editable: true },
    ]) {
      expect(shortcutFor(press('1', { target }), false)).toBeNull();
      expect(shortcutFor(press('Enter', { ctrlKey: true, target }), false)).toBeNull();
    }
  });

  test('buttons, radios and checkboxes do not count as text fields', () => {
    expect(shortcutFor(press('n', { target: { tag: 'button' } }), false)).toEqual({ type: 'next' });
    expect(shortcutFor(press('2', { target: { tag: 'input', type: 'radio' } }), false)).toEqual({ type: 'option', index: 1 });
    expect(shortcutFor(press('f', { target: { tag: 'input', type: 'checkbox' } }), false)).toEqual({ type: 'flag' });
  });

  test('arrow keys are left to a focused radio or checkbox, letters are not', () => {
    for (const type of ['radio', 'checkbox']) {
      const target = { tag: 'input', type };

      expect(shortcutFor(press('ArrowRight', { target }), false)).toBeNull();
      expect(shortcutFor(press('ArrowLeft', { target }), false)).toBeNull();
      expect(shortcutFor(press('n', { target }), false)).toEqual({ type: 'next' });
    }
  });

  test('arrow keys scroll a focused code block instead of changing the question', () => {
    const target = { tag: 'pre' };

    expect(shortcutFor(press('ArrowRight', { target }), false)).toBeNull();
    expect(shortcutFor(press('ArrowLeft', { target }), false)).toBeNull();
    expect(shortcutFor(press('n', { target }), false)).toEqual({ type: 'next' });
  });

  test('a held modifier cancels the shortcut', () => {
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      expect(shortcutFor(press('n', { [modifier]: true }), false)).toBeNull();
      expect(shortcutFor(press('1', { [modifier]: true }), false)).toBeNull();
    }
  });

  test('a repeating key fires once', () => {
    expect(shortcutFor(press('f', { repeat: true }), false)).toBeNull();
    expect(shortcutFor(press('Enter', { ctrlKey: true, repeat: true }), false)).toBeNull();
  });
});

describe('optionAnswer', () => {
  const single = prepareQuiz([catalogQuestion('s1', 'alpha')], false)[0];
  const multi = prepareQuiz([catalogQuestion('m1', 'alpha', { type: 'multi' })], false)[0];
  const truth = prepareQuiz([catalogQuestion('t1', 'alpha', { type: 'true-false' })], false)[0];

  test('single choice selects the option and keeps it selected on a second press', () => {
    expect(optionAnswer(single, undefined, 1)).toEqual(['b']);
    expect(optionAnswer(single, ['a'], 2)).toEqual(['c']);
    expect(optionAnswer(single, ['b'], 1)).toEqual(['b']);
  });

  test('multi choice toggles in display order and clears when nothing is left', () => {
    expect(optionAnswer(multi, undefined, 2)).toEqual(['c']);
    expect(optionAnswer(multi, ['c'], 0)).toEqual(['a', 'c']);
    expect(optionAnswer(multi, ['a', 'c'], 2)).toEqual(['a']);
    expect(optionAnswer(multi, ['a'], 0)).toBeUndefined();
  });

  test('true-false reads 1 as True and 2 as False', () => {
    expect(optionAnswer(truth, undefined, 0)).toBe(true);
    expect(optionAnswer(truth, true, 1)).toBe(false);
    expect(optionAnswer(truth, false, 2)).toBe('none');
  });

  test('an option that does not exist does nothing', () => {
    expect(optionAnswer(single, undefined, 3)).toBe('none');
    expect(optionAnswer(multi, ['a'], 8)).toBe('none');
    expect(optionAnswer(single, undefined, -1)).toBe('none');
  });

  test('an answer of the wrong kind is treated as no answer', () => {
    expect(optionAnswer(multi, true, 0)).toEqual(['a']);
  });
});
