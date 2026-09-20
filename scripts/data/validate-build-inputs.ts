import { withProcessTelemetry } from '../deployment/telemetry.js';
import { validateBuildInputs } from './validation/build-inputs.js';

console.log('[data:validate:build-inputs] starting production build-input validation');
await withProcessTelemetry('data-validate-build-inputs', validateBuildInputs);
