import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const LOCK_SCHEMA_VERSION = 1 as const;
export const LOCK_FILE = 'upstream.lock.json';

export interface UpstreamPin {
  repository: string;
  commit: string;
}

export interface UpstreamLock {
  schemaVersion: typeof LOCK_SCHEMA_VERSION;
  turnBasedGameData: UpstreamPin;
  starRailRes: UpstreamPin;
}

const REPOSITORIES = {
  turnBasedGameData: 'https://github.com/DimbreathBot/TurnBasedGameData.git',
  starRailRes: 'https://github.com/Mar-7th/StarRailRes.git'
} as const;

function fail(message: string): never {
  throw new Error(`[upstream] lock 无效：${message}`);
}

function parsePin(value: unknown, name: keyof typeof REPOSITORIES): UpstreamPin {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} 必须是对象`);
  const pin = value as Record<string, unknown>;
  if (pin.repository !== REPOSITORIES[name])
    fail(`${name}.repository 必须是 ${REPOSITORIES[name]}`);
  if (typeof pin.commit !== 'string' || !/^[0-9a-f]{40}$/i.test(pin.commit))
    fail(`${name}.commit 必须是 40 位完整十六进制 SHA`);
  return { repository: REPOSITORIES[name], commit: pin.commit.toLowerCase() };
}

export function parseUpstreamLock(value: unknown): UpstreamLock {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('根值必须是对象');
  const lock = value as Record<string, unknown>;
  if (lock.schemaVersion !== LOCK_SCHEMA_VERSION)
    fail(`schemaVersion 必须为 ${LOCK_SCHEMA_VERSION}`);
  return {
    schemaVersion: LOCK_SCHEMA_VERSION,
    turnBasedGameData: parsePin(lock.turnBasedGameData, 'turnBasedGameData'),
    starRailRes: parsePin(lock.starRailRes, 'starRailRes')
  };
}

export async function readUpstreamLock(siteRoot: string): Promise<UpstreamLock> {
  const file = path.join(siteRoot, LOCK_FILE);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(`[upstream] 无法读取 ${LOCK_FILE}`, { cause: error });
  }
  return parseUpstreamLock(parsed);
}
