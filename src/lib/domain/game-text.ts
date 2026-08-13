export interface GameTextToken {
  value: string;
  color?: string;
  italic?: boolean;
  unbreak?: boolean;
}

interface GameTextStyle {
  color?: string;
  italic: boolean;
  unbreak: boolean;
}

type SupportedTag = 'color' | 'i' | 'unbreak';

const markupPattern = /<[^>]*>/g;
const colorPattern = /^<color=(#[0-9a-f]{6}(?:[0-9a-f]{2})?)>$/i;

export function normalizeGameText(value = ''): string {
  return value.replace(/\\n/g, '\n').replaceAll('\\u00A0', ' ');
}

export function parseGameText(value = ''): GameTextToken[] {
  const source = normalizeGameText(value);
  const tokens: GameTextToken[] = [];
  const stack: Array<{ tag: SupportedTag; previous: GameTextStyle }> = [];
  let style: GameTextStyle = { italic: false, unbreak: false };
  let cursor = 0;

  for (const match of source.matchAll(markupPattern)) {
    appendToken(tokens, source.slice(cursor, match.index), style);
    const markup = match[0];
    const color = markup.match(colorPattern)?.[1];
    if (color) {
      stack.push({ tag: 'color', previous: style });
      style = { ...style, color };
    } else if (/^<i\s*>$/i.test(markup)) {
      stack.push({ tag: 'i', previous: style });
      style = { ...style, italic: true };
    } else if (/^<unbreak\s*>$/i.test(markup)) {
      stack.push({ tag: 'unbreak', previous: style });
      style = { ...style, unbreak: true };
    } else {
      const closingTag = markup.match(/^<\/(color|i|unbreak)\s*>$/i)?.[1]?.toLowerCase() as
        SupportedTag | undefined;
      if (closingTag) style = closeTag(stack, closingTag, style);
    }
    cursor = match.index + markup.length;
  }
  appendToken(tokens, source.slice(cursor), style);
  return tokens;
}

export function gameTextToPlain(value = ''): string {
  return parseGameText(value)
    .map((token) => token.value)
    .join('');
}

function appendToken(tokens: GameTextToken[], value: string, style: GameTextStyle): void {
  if (!value) return;
  const token: GameTextToken = {
    value,
    ...(style.color ? { color: style.color } : {}),
    ...(style.italic ? { italic: true } : {}),
    ...(style.unbreak ? { unbreak: true } : {})
  };
  const previous = tokens.at(-1);
  if (
    previous &&
    previous.color === token.color &&
    previous.italic === token.italic &&
    previous.unbreak === token.unbreak
  )
    previous.value += value;
  else tokens.push(token);
}

function closeTag(
  stack: Array<{ tag: SupportedTag; previous: GameTextStyle }>,
  tag: SupportedTag,
  current: GameTextStyle
): GameTextStyle {
  const index = stack.map((entry) => entry.tag).lastIndexOf(tag);
  if (index < 0) return current;
  const previous = stack[index].previous;
  stack.splice(index);
  return previous;
}
