# Scripts Directory

This directory contains utility scripts for development and CI workflows.

## CI & Quality Scripts

### `ci-preflight.sh`

**Purpose**: Run comprehensive pre-flight checks before pushing to CI to catch common issues early.

**Usage**:
```bash
npm run ci:preflight
# or directly:
./scripts/ci-preflight.sh
```

**What it checks**:
1. ✅ TypeScript compilation (`npm run typecheck`)
2. ✅ ESLint linting (`npm run lint`)
3. ✅ Excluded directories are properly configured in `tsconfig.json`
4. ✅ No stray build artifacts in source directories

**When to use**:
- Before pushing to GitHub (especially to feature branches)
- After making changes to `tsconfig.json` or adding new generated directories
- When setting up a new development environment

**Exit codes**:
- `0`: All checks passed ✅
- `1`: One or more checks failed ❌

---

## Bundle Scripts

### `make-catchall-cortex-bundle.sh` / `make-catchall-cortex-bundle.ps1`

**Purpose**: Create distributable bundles of Cortex/intent/classification code for sharing or documentation.

**Usage**:
```bash
# macOS/Linux:
./scripts/make-catchall-cortex-bundle.sh

# Windows PowerShell:
powershell -ExecutionPolicy Bypass -File scripts\make-catchall-cortex-bundle.ps1
```

**Output**:
- `artifacts/catchall-cortex-bundle/files/` - Copied source files
- `artifacts/catchall-cortex-bundle/manifest.txt` - List of included files
- `artifacts/catchall-cortex-bundle.zip` - Compressed bundle

**Note**: The `artifacts/` directory is excluded from TypeScript compilation via `tsconfig.json` because bundled files contain imports relative to their original locations.

---

## Database Scripts

### `gen_db_types.sh`
Generates TypeScript types from Supabase schema.

### `drift_check.sh`
Checks for schema drift between local and remote Supabase.

### `generate_supabase_diagnostics.sh`
Generates diagnostic information for Supabase setup.

---

## Validation Scripts

### `check-direct-supabase.js`
Checks for direct Supabase client usage (should use repo layer).

### `check-schema.mjs`
Validates database schema conformance.

---

## Best Practices

1. **Always run `npm run ci:preflight` before pushing** to catch issues locally
2. **Keep scripts executable**: `chmod +x scripts/*.sh`
3. **Document new scripts** in this README
4. **Use proper error handling** in scripts (`set -euo pipefail` for bash)
5. **Add new generated directories** to `tsconfig.json` exclude list

---

## Troubleshooting

### "Cannot find module" errors in CI

If CI fails with TypeScript errors about missing modules in `artifacts/` or other generated directories:

1. Check that the directory is in `tsconfig.json` exclude list
2. Run `npm run ci:preflight` locally to verify
3. If needed, add to exclude: `"directory/**/*"`

### Script permission denied

Make scripts executable:
```bash
chmod +x scripts/*.sh
```

### ESLint/TypeCheck passes locally but fails in CI

- Ensure you have the latest dependencies: `npm install`
- Check Node.js version matches CI: `node --version` (should be 20.x)
- Clear caches: `npm run clean && npm install`
