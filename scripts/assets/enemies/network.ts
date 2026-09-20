export const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 3;

export interface EnemyRequirement {
  id: string;
  name: string;
}
export interface NanokaMonster {
  id: string;
  name: string;
  imageId: string;
  imagePath: string;
  detailUrl: string;
  iconUrl: string;
}
export interface RetryOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}
export class HttpError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const decimal = (value: unknown): string | undefined => {
  const normalized = typeof value === 'number' ? String(value) : value;
  return typeof normalized === 'string' && /^\d+$/.test(normalized) ? normalized : undefined;
};

export function extractImageId(value: unknown): string | undefined {
  return typeof value === 'string' ? value.match(/\d+/)?.[0] : undefined;
}

export function parseNanokaMonster(
  value: unknown,
  requirement: EnemyRequirement,
  detailUrl: string,
  baseUrl = 'https://static.nanoka.cc'
): NanokaMonster {
  const record = object(value);
  if (!record) throw new Error('monster JSON 不是对象。');
  const id = decimal(record.id);
  if (!id) throw new Error('monster JSON 缺少合法 id。');
  if (id !== requirement.id)
    throw new Error(`monster JSON id 不匹配：期望 ${requirement.id}，实际 ${id}。`);
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name) throw new Error('monster JSON 缺少 name。');
  const imagePath = typeof record.image_path === 'string' ? record.image_path : '';
  const imageId = extractImageId(imagePath);
  if (!imageId) throw new Error('monster JSON 缺少可解析的 image_path。');
  return {
    id,
    name,
    imageId,
    imagePath,
    detailUrl,
    iconUrl: `${baseUrl.replace(/\/$/, '')}/assets/hsr/monstermiddleicon/Monster_${imageId}.webp`
  };
}

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get('retry-after')?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.min(Math.max(date - Date.now(), 0), 30_000);
}

export async function fetchWithRetry(url: string, options: RetryOptions = {}): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const wait = options.sleep ?? delay;
  const retries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { 'user-agent': 'HSR-Database enemy asset update' }
      });
      if ((response.status !== 429 && response.status < 500) || attempt === retries)
        return response;
      const milliseconds = retryAfter(response) ?? 1000 * 2 ** attempt;
      await response.body?.cancel().catch(() => undefined);
      await wait(milliseconds);
    } catch (error) {
      if (attempt === retries)
        throw new Error(`请求失败：${url}：${(error as Error).message}`, { cause: error });
      await wait(1000 * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`请求失败：${url}`);
}

export async function fetchJson(url: string, options: RetryOptions = {}): Promise<unknown> {
  const response = await fetchWithRetry(url, options);
  if (!response.ok) throw new HttpError(`HTTP ${response.status}：${url}`, url, response.status);
  const text = await response.text();
  if (!text.trim()) throw new Error(`JSON 响应为空：${url}`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON 响应无法解析：${url}`, { cause: error });
  }
}

export async function fetchNanokaVersion(
  baseUrl: string,
  options: RetryOptions = {}
): Promise<string> {
  const manifest = object(await fetchJson(`${baseUrl.replace(/\/$/, '')}/manifest.json`, options));
  const hsr = object(manifest?.hsr);
  if (typeof hsr?.latest !== 'string' || !hsr.latest.trim())
    throw new Error('Nanoka manifest 缺少 hsr.latest。');
  return hsr.latest.trim();
}

export async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('并发数必须为正整数。');
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        results[index] = await operation(values[index], index);
      }
    })
  );
  return results;
}
