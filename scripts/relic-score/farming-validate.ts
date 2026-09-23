import { loadFarmingInputs, probabilityModelDigest } from './farming-inputs.js';

const { model } = await loadFarmingInputs();
console.log(
  `[relic-score/farming] validated ${model.config.modelVersion}; ${model.substats.length} substats; ${Object.keys(model.mainBySlot).length} slots; digest=${probabilityModelDigest(model.config)}`
);
