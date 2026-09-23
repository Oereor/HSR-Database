import { validateCurrentProfiles } from './validate.js';

const artifact = await validateCurrentProfiles();
console.log(`[relic-score] validated ${artifact.profiles.length} character profiles`);
