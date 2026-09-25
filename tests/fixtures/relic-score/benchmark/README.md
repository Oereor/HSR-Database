# Prototype benchmark fixture

`prototype.json` is a deterministic Lens B test artifact covering every legal main stat for character 1310 in all six slots. It is never loaded by production code. Regenerate explicitly with `pnpm relic-score:calibrate --mode=fixture --cases=1310:HEAD,1310:HAND,1310:BODY,1310:FOOT,1310:NECK,1310:OBJECT --out=tests/fixtures/relic-score/benchmark/prototype.json`.
