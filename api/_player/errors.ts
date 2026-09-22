import type { PlayerErrorCode, PlayerErrorResponse } from '../../src/lib/player/contract.js';

interface ErrorMetadata {
  status: number;
  retryable: boolean;
}

const errorMetadata: Record<PlayerErrorCode, ErrorMetadata> = {
  INVALID_UID: { status: 400, retryable: false },
  PLAYER_NOT_FOUND: { status: 404, retryable: false },
  RATE_LIMITED: { status: 429, retryable: true },
  UPSTREAM_TIMEOUT: { status: 504, retryable: true },
  UPSTREAM_UNAVAILABLE: { status: 503, retryable: true },
  UPSTREAM_INVALID_RESPONSE: { status: 502, retryable: true }
};

export class PlayerApiError extends Error {
  readonly code: PlayerErrorCode;
  readonly retryAfterSeconds?: number;
  readonly diagnostic?: string;

  constructor(code: PlayerErrorCode, retryAfterSeconds?: number, diagnostic?: string) {
    super(code);
    this.name = 'PlayerApiError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.diagnostic = diagnostic;
  }
}

export function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers
    }
  });
}

export function playerErrorResponse(error: PlayerApiError): Response {
  const metadata = errorMetadata[error.code];
  const body: PlayerErrorResponse = {
    error: {
      code: error.code,
      retryable: metadata.retryable,
      ...(error.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: error.retryAfterSeconds })
    }
  };

  return jsonResponse(body, metadata.status, { 'Cache-Control': 'no-store' });
}
