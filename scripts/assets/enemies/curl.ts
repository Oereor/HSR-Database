import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

interface CurlResult {
  stdout: Buffer;
  stderr: string;
  exitCode: number;
}

interface CurlMetadata {
  status: number;
  contentType?: string;
  retryAfter?: string;
}

async function runCurl(
  executable: string,
  args: string[],
  signal?: AbortSignal | null
): Promise<CurlResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let size = 0;
    let aborted = false;
    const abort = (): void => {
      aborted = true;
      child.kill();
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_RESPONSE_BYTES) {
        child.kill();
        reject(new Error(`curl 响应超过 ${MAX_RESPONSE_BYTES} bytes。`));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (exitCode) => {
      signal?.removeEventListener('abort', abort);
      if (aborted) {
        reject(new DOMException('curl 请求已超时。', 'AbortError'));
        return;
      }
      resolve({
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr).toString('utf8').trim(),
        exitCode: exitCode ?? 1
      });
    });
  });
}

export function parseCurlResponse(
  output: Buffer,
  marker: string
): {
  body: Buffer;
  metadata: CurlMetadata;
} {
  const markerBytes = Buffer.from(marker, 'utf8');
  const markerIndex = output.lastIndexOf(markerBytes);
  if (markerIndex < 0) throw new Error('curl 响应缺少状态元数据。');
  const body = output.subarray(0, markerIndex);
  const [statusValue, contentTypeValue, retryAfterValue] = output
    .subarray(markerIndex + markerBytes.length)
    .toString('utf8')
    .trimEnd()
    .split('\t');
  const status = Number(statusValue);
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new Error(`curl 返回非法 HTTP status：${statusValue}`);
  }
  return {
    body,
    metadata: {
      status,
      ...(contentTypeValue ? { contentType: contentTypeValue } : {}),
      ...(retryAfterValue ? { retryAfter: retryAfterValue } : {})
    }
  };
}

export function createCurlFetch(executable = process.platform === 'win32' ? 'curl.exe' : 'curl') {
  return async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const method = init.method?.toUpperCase() ?? 'GET';
    if (method !== 'GET' || init.body) throw new Error('curl transport 仅支持无 body 的 GET。');
    const url = input instanceof Request ? input.url : String(input);
    const marker = `\n__HSR_ENEMY_CURL_${randomUUID()}__`;
    const args = [
      '--silent',
      '--show-error',
      '--location',
      '--max-time',
      '30',
      '--write-out',
      `${marker}%{http_code}\t%{content_type}\t%header{retry-after}`
    ];
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    headers.forEach((value, name) => args.push('--header', `${name}: ${value}`));
    args.push(url);
    const result = await runCurl(executable, args, init.signal);
    if (result.exitCode !== 0) {
      throw new Error(`curl exit ${result.exitCode}${result.stderr ? `：${result.stderr}` : ''}`);
    }
    const parsed = parseCurlResponse(result.stdout, marker);
    const responseHeaders = new Headers();
    if (parsed.metadata.contentType)
      responseHeaders.set('content-type', parsed.metadata.contentType);
    if (parsed.metadata.retryAfter) responseHeaders.set('retry-after', parsed.metadata.retryAfter);
    return new Response(Uint8Array.from(parsed.body).buffer, {
      status: parsed.metadata.status,
      headers: responseHeaders
    });
  };
}
