import type { InlineGameTextIcon } from './types.js';

export interface GameTextToken {
  value: string;
  icon?: InlineGameTextIcon;
  color?: string;
  italic?: boolean;
  underline?: boolean;
  unbreak?: boolean;
  scaling?: boolean;
}

interface GameTextStyle {
  color?: string;
  italic: boolean;
  underline: boolean;
  unbreak: boolean;
  scaling: boolean;
}

type SupportedTag = 'color' | 'i' | 'u' | 'unbreak' | 'scaling-value';

const markupPattern = /<[^>]*>/g;
const colorPattern = /^<color=(#[0-9a-f]{6}(?:[0-9a-f]{2})?)>$/i;
const iconPattern = /^<icon\s+([^>]*)>$/i;
const iconAttributePattern = /([a-z][\w-]*)=("[^"]*"|'[^']*'|[^\s>]+)/gi;

export function normalizeGameText(value = ''): string {
  return value.replace(/\\n/g, '\n').replaceAll('\\u00A0', ' ');
}

function parseStyledGameText(value = '', allowScaling = false): GameTextToken[] {
  const source = normalizeGameText(value);
  const tokens: GameTextToken[] = [];
  const stack: Array<{ tag: SupportedTag; previous: GameTextStyle }> = [];
  let style: GameTextStyle = {
    italic: false,
    underline: false,
    unbreak: false,
    scaling: false
  };
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
    } else if (/^<u\s*>$/i.test(markup)) {
      stack.push({ tag: 'u', previous: style });
      style = { ...style, underline: true };
    } else if (/^<unbreak\s*>$/i.test(markup)) {
      stack.push({ tag: 'unbreak', previous: style });
      style = { ...style, unbreak: true };
    } else if (allowScaling && /^<scaling-value\s*>$/i.test(markup)) {
      stack.push({ tag: 'scaling-value', previous: style });
      style = { ...style, scaling: true };
    } else {
      const icon = parseInlineIcon(markup);
      if (icon) appendIconToken(tokens, icon, style);
      else {
        const closingTag = markup
          .match(/^<\/(color|i|u|unbreak|scaling-value)\s*>$/i)?.[1]
          ?.toLowerCase() as SupportedTag | undefined;
        if (closingTag && (allowScaling || closingTag !== 'scaling-value'))
          style = closeTag(stack, closingTag, style);
      }
    }
    cursor = match.index + markup.length;
  }
  appendToken(tokens, source.slice(cursor), style);
  return tokens;
}

function parseInlineIcon(markup: string): InlineGameTextIcon | undefined {
  const source = markup.match(iconPattern)?.[1];
  if (!source) return undefined;
  const attributes = new Map<string, string>();
  for (const match of source.matchAll(iconAttributePattern)) {
    const raw = match[2];
    attributes.set(match[1].toLowerCase(), raw.replace(/^(?:"|')|(?:"|')$/g, ''));
  }
  const spriteName = attributes.get('spritename');
  const id = Number(attributes.get('id'));
  if (!spriteName || !/^[a-z0-9_]+$/i.test(spriteName) || !Number.isInteger(id) || id < 0)
    return undefined;
  const dimension = (name: 'width' | 'height'): number | undefined => {
    const raw = attributes.get(name);
    if (raw === undefined) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  };
  const width = dimension('width');
  const height = dimension('height');
  return {
    spriteName,
    id,
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height })
  };
}

function appendIconToken(
  tokens: GameTextToken[],
  icon: InlineGameTextIcon,
  style: GameTextStyle
): void {
  tokens.push({
    value: '',
    icon,
    ...(style.color ? { color: style.color } : {}),
    ...(style.italic ? { italic: true } : {}),
    ...(style.underline ? { underline: true } : {}),
    ...(style.unbreak ? { unbreak: true } : {}),
    ...(style.scaling ? { scaling: true } : {})
  });
}

export function parseGameText(value = ''): GameTextToken[] {
  return parseStyledGameText(value);
}

export function parseGameTextWithScaling(value = ''): GameTextToken[] {
  return parseStyledGameText(value, true);
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
    ...(style.underline ? { underline: true } : {}),
    ...(style.unbreak ? { unbreak: true } : {}),
    ...(style.scaling ? { scaling: true } : {})
  };
  const previous = tokens.at(-1);
  if (
    previous &&
    !previous.icon &&
    previous.color === token.color &&
    previous.italic === token.italic &&
    previous.underline === token.underline &&
    previous.unbreak === token.unbreak &&
    previous.scaling === token.scaling
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
