# CI Memory Tuning

## Raising the Heap Limit

CI runs use `NODE_OPTIONS="--max-old-space-size=6144"` by default. Raise the limit by overriding this environment variable in the workflow:

```yaml
env:
  NODE_OPTIONS: "--max-old-space-size=8192"
```

## Reproducing CI Settings Locally

Match the CI memory and worker settings locally with:

```bash
NODE_OPTIONS=--max-old-space-size=8192 npm run test:ci -- --maxWorkers=50%
```

This keeps local development fast by default while making memory tuning opt-in for heavy runs.
