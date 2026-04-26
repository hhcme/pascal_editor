# Guide Detection Fixtures

This directory contains small floor plan fixtures used by the local guide detection debug runner.

## MLStructFP

The `mlstructfp` samples were copied from the public `test/data` directory of
`MLSTRUCT/MLStructFP`.

- Source: https://github.com/MLSTRUCT/MLStructFP/tree/master/test/data
- License: MIT, as declared by the upstream repository
- Purpose: local regression/debug inputs for wall and opening detection

Generated debug artifacts are written to `debug-output/` and are intentionally ignored.

## External Regression Samples

Large third-party datasets should live under `external/`, which is ignored by Git.
They are useful for local sweeps but should not be committed unless their license and
size are explicitly reviewed.

Current local regression commands:

```sh
bun run guide:debug -- --input packages/editor/fixtures/guide-detection/mlstructfp --summary-only
bun run guide:debug -- --input packages/editor/fixtures/guide-detection/external/robin/ROBIN --summary-only --scale 2
```

Use `--scale` for datasets without calibration metadata. Otherwise opening-width
filters can reject valid doors simply because the debug guide scale is arbitrary.
