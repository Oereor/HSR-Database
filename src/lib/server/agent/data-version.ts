import { AGENT_LOCALE, type DataVersion } from '../../agent/contracts.js';
import { getManifest } from '../generated.js';

let cachedVersion: Promise<DataVersion> | undefined;

export function getAgentDataVersion(): Promise<DataVersion> {
  cachedVersion ??= getManifest().then((manifest) => ({
    gameVersion: manifest.gameVersionFull ?? manifest.gameVersion,
    sourceCommit: manifest.sourceCommit,
    dataRevision: manifest.dataRevision,
    locale: AGENT_LOCALE
  }));
  return cachedVersion;
}
