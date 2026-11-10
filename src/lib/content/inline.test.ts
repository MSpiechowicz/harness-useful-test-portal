import { describe, expect, test } from 'bun:test';
import { splitInline } from './inline';

describe('splitInline', () => {
  test('plain text is one prose segment', () => {
    expect(splitInline('Just words')).toEqual([{ code: false, text: 'Just words' }]);
  });

  test('paired backticks become code segments', () => {
    expect(splitInline('Use `max_tokens` and `temperature` here')).toEqual([
      { code: false, text: 'Use ' },
      { code: true, text: 'max_tokens' },
      { code: false, text: ' and ' },
      { code: true, text: 'temperature' },
      { code: false, text: ' here' },
    ]);
  });

  test('an unpaired backtick stays literal', () => {
    expect(splitInline('a ` b')).toEqual([{ code: false, text: 'a ` b' }]);
  });

  test('markup is never interpreted, only returned as text', () => {
    expect(splitInline('`<script>alert(1)</script>` <b>x</b>')).toEqual([
      { code: true, text: '<script>alert(1)</script>' },
      { code: false, text: ' <b>x</b>' },
    ]);
  });

  test('empty code spans are kept as literal backticks', () => {
    expect(splitInline('a `` b')).toEqual([
      { code: false, text: 'a ' },
      { code: false, text: '``' },
      { code: false, text: ' b' },
    ]);
  });
});
