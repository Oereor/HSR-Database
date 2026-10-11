# Prototype benchmark fixture

`prototype.json` is a historical deterministic V1 Lens B artifact covering every legal main stat for character 1310 in all six slots. It is not the production V2 Benchmark.

The original regeneration command was `pnpm relic-score:calibrate --mode=fixture --cases=1310:HEAD,1310:HAND,1310:BODY,1310:FOOT,1310:NECK,1310:OBJECT --out=tests/fixtures/relic-score/benchmark/prototype.json`. That V1 command has been removed; it is recorded here as provenance, not as a current maintenance step. Current production rules and generation are documented in the [V2 contract](../../../../docs/relic-score-feature/relic-rating-v2.md) and [Benchmark maintenance](../../../../docs/relic-score-feature/benchmark-maintenance.md).
