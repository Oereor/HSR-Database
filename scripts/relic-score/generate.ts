import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { format, resolveConfig } from 'prettier';
import { generateProfiles } from './profiles.js';
import {
  loadProfileInputs,
  profilesPath,
  validateCurrentProfiles,
  validateProfiles
} from './validate.js';

const inputs = await loadProfileInputs();
const artifact = generateProfiles(
  inputs.characters,
  inputs.templates,
  inputs.overrides,
  inputs.sourceCommit,
  inputs.policy
);
validateProfiles(artifact, inputs, { allowStaleReviews: true });
await mkdir(path.dirname(profilesPath), { recursive: true });
await writeFile(
  profilesPath,
  await format(JSON.stringify(artifact), {
    ...(await resolveConfig(profilesPath)),
    filepath: profilesPath
  })
);
await validateCurrentProfiles({ allowStaleReviews: true });
console.log(`[relic-score] generated ${artifact.profiles.length} character profiles`);
