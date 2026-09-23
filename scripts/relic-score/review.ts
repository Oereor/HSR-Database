import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { format, resolveConfig } from 'prettier';
import { siteRoot } from '../data/paths.js';
import { writeGeneratedProfiles } from './generate-artifact.js';
import { approveCurrentReview, currentReviewSummary } from './review-core.js';
import { loadProfileInputs, validateCurrentProfiles } from './validate.js';

const args = process.argv.slice(2);
const character = args.find((arg) => arg.startsWith('--character='))?.slice('--character='.length);
const approve = args.includes('--approve-current');
if (
  !character ||
  !/^\d+$/.test(character) ||
  args.some((arg) => arg !== `--character=${character}` && arg !== '--approve-current') ||
  args.filter((arg) => arg.startsWith('--character=')).length !== 1 ||
  args.filter((arg) => arg === '--approve-current').length > 1
)
  throw new Error('[relic-score/review] usage: --character=ID [--approve-current]');

const inputs = await loadProfileInputs();
const summary = currentReviewSummary(inputs, character);
console.log(JSON.stringify(summary, null, 2));
if (approve) {
  const overridesPath = path.join(siteRoot, 'data/relic-score/profile-overrides.json');
  const updated = approveCurrentReview(inputs, character);
  await writeFile(
    overridesPath,
    await format(JSON.stringify(updated), {
      ...(await resolveConfig(overridesPath)),
      filepath: overridesPath
    })
  );
  await writeGeneratedProfiles();
  await validateCurrentProfiles();
  console.log(`[relic-score/review] approved current input for ${character}`);
}
