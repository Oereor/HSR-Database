import { writeGeneratedProfiles } from './generate-artifact.js';

const count = await writeGeneratedProfiles();
console.log(`[relic-score] generated ${count} character profiles`);
