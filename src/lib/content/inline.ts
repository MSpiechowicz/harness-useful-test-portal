export interface InlineSegment {
  code: boolean;
  text: string;
}

/**
 * Splits plain text into prose and `code` segments at paired backticks. An unpaired backtick stays literal. The
 * result is rendered as text nodes, never as HTML, so content cannot inject markup.
 */
export function splitInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let index = 0;

  while (index < text.length) {
    const open = text.indexOf('`', index);
    const close = open === -1 ? -1 : text.indexOf('`', open + 1);

    if (open === -1 || close === -1) {
      segments.push({ code: false, text: text.slice(index) });
      break;
    }

    if (open > index) segments.push({ code: false, text: text.slice(index, open) });
    if (close > open + 1) segments.push({ code: true, text: text.slice(open + 1, close) });
    else segments.push({ code: false, text: '``' });

    index = close + 1;
  }

  return segments;
}
