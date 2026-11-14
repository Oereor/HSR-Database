import type { InlineGameTextIcon } from './types.js';

export interface GameTextRuby {
  index: number;
  annotation: string;
}

export interface GameTextToken {
  value: string;
  ruby?: GameTextRuby;
  icon?: InlineGameTextIcon;
  color?: string;
  italic?: boolean;
  underline?: boolean;
  unbreak?: boolean;
  scaling?: boolean;
  fixed?: boolean;
}

interface GameTextStyle {
  color?: string;
  italic: boolean;
  underline: boolean;
  unbreak: boolean;
  scaling: boolean;
  fixed: boolean;
}

type SupportedTag = 'color' | 'i' | 'u' | 'unbreak' | 'scaling-value' | 'fixed-param';

const markupPattern = /<[^>]*>/g;
const colorPattern = /^<color=(#[0-9a-f]{6}(?:[0-9a-f]{2})?)>$/i;
const iconPattern = /^<icon\s+([^>]*)>$/i;
const iconAttributePattern = /([a-z][\w-]*)=("[^"]*"|'[^']*'|[^\s>]+)/gi;

export function normalizeGameText(value = ''): string {
  return value.replace(/\\n/g, '\n').replaceAll('\\u00A0', ' ');
}

export function normalizeRubyMarkup(value: string, onMalformed?: (offset: number) => void): string {
  let result = '';
  let cursor = 0;
  let start: { offset: number; annotation: string } | undefined;
  for (const match of value.matchAll(/\{RUBY_([BE])#([^{}\r\n]*)\}/g)) {
    const base = value.slice(cursor, match.index);
    if (match[1] === 'B') {
      if (start) onMalformed?.(start.offset);
      result += base;
      start = { offset: match.index, annotation: match[2].trim() };
    } else {
      if (start?.annotation && !match[2] && base.trim() && !/[\r\n]|\\n/.test(base)) {
        const annotation = encodeURIComponent(start.annotation.toWellFormed());
        result += `<ruby-note=${annotation}>${base}</ruby-note>`;
      } else {
        onMalformed?.(start?.offset ?? match.index);
        result += base;
      }
      start = undefined;
    }
    cursor = match.index + match[0].length;
  }
  if (start) onMalformed?.(start.offset);
  return result + value.slice(cursor);
}

export function groupGameTextRuby<T extends { ruby?: GameTextRuby }>(
  tokens: readonly T[]
): Array<{ ruby: GameTextRuby; tokens: T[] } | { token: T }> {
  const groups: Array<{ ruby: GameTextRuby; tokens: T[] } | { token: T }> = [];
  for (const token of tokens) {
    const previous = groups.at(-1);
    if (!token.ruby) groups.push({ token });
    else if (previous && 'ruby' in previous && previous.ruby.index === token.ruby.index)
      previous.tokens.push(token);
    else groups.push({ ruby: token.ruby, tokens: [token] });
  }
  return groups;
}

function parseStyledGameText(value = '', allowScaling = false): GameTextToken[] {
  const source = normalizeRubyMarkup(normalizeGameText(value));
  const tokens: GameTextToken[] = [];
  const stack: Array<{ tag: SupportedTag; previous: GameTextStyle }> = [];
  let style: GameTextStyle = {
    italic: false,
    underline: false,
    unbreak: false,
    fixed: false,
    scaling: false
  };
  let ruby: GameTextRuby | undefined;
  let cursor = 0;

  for (const match of source.matchAll(markupPattern)) {
    appendToken(tokens, source.slice(cursor, match.index), style, ruby);
    const markup = match[0];
    const color = markup.match(colorPattern)?.[1];
    const annotation = markup.match(/^<ruby-note=([^>]+)>$/)?.[1];
    if (annotation) {
      try {
        ruby = { index: match.index, annotation: decodeURIComponent(annotation) };
      } catch {
        ruby = undefined;
      }
    } else if (markup === '</ruby-note>') {
      ruby = undefined;
    } else if (color) {
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
    } else if (allowScaling && /^<fixed-param\s*>$/i.test(markup)) {
      stack.push({ tag: 'fixed-param', previous: style });
      style = { ...style, fixed: true };
    } else {
      const icon = parseInlineIcon(markup);
      if (icon) appendToken(tokens, '', style, ruby, icon);
      else {
        const closingTag = markup
          .match(/^<\/(color|i|u|unbreak|scaling-value|fixed-param)\s*>$/i)?.[1]
          ?.toLowerCase() as SupportedTag | undefined;
        if (closingTag && (allowScaling || !['scaling-value', 'fixed-param'].includes(closingTag)))
          style = closeTag(stack, closingTag, style);
      }
    }
    cursor = match.index + markup.length;
  }
  appendToken(tokens, source.slice(cursor), style, ruby);
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

function appendToken(
  tokens: GameTextToken[],
  value: string,
  style: GameTextStyle,
  ruby?: GameTextRuby,
  icon?: InlineGameTextIcon
): void {
  if (!value && !icon) return;
  const token: GameTextToken = {
    value,
    ...(ruby ? { ruby } : {}),
    ...(icon ? { icon } : {}),
    ...(style.color ? { color: style.color } : {}),
    ...(style.italic ? { italic: true } : {}),
    ...(style.underline ? { underline: true } : {}),
    ...(style.unbreak ? { unbreak: true } : {}),
    ...(style.fixed ? { fixed: true } : {}),
    ...(style.scaling ? { scaling: true } : {})
  };
  const previous = tokens.at(-1);
  if (
    previous &&
    !icon &&
    !previous.icon &&
    previous.ruby === ruby &&
    previous.color === token.color &&
    previous.italic === token.italic &&
    previous.underline === token.underline &&
    previous.unbreak === token.unbreak &&
    previous.fixed === token.fixed &&
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
