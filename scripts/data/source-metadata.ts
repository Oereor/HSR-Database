export interface GameVersionMetadata {
  gameVersionFull: string | null;
  gameVersion: string | null;
}

const OSPROD_VERSION_PATTERN = /^OSPRODWin(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:_|$)/;

export function parseGameVersion(sourceVersion: string): GameVersionMetadata {
  const match = sourceVersion.match(OSPROD_VERSION_PATTERN);
  if (!match) return { gameVersionFull: null, gameVersion: null };
  const [, major, minor, patch] = match;
  return {
    gameVersionFull: `${major}.${minor}.${patch}`,
    gameVersion: `${major}.${minor}`
  };
}
