import { withProcessTelemetry } from '../deployment/telemetry.js';
import { validateFull } from './validation/full.js';

console.log('[data:validate:full] starting full semantic validation');
await withProcessTelemetry('data-validate-full', validateFull);
