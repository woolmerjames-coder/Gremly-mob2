# 🚀 Quick CI Reference Card

## Before Every Push

```bash
npm run ci:preflight
```

**This runs 4 critical checks**:
1. ✅ TypeScript compilation
2. ✅ ESLint validation  
3. ✅ Directory exclusion verification
4. ✅ Build artifact detection

---

## Common Issues & Quick Fixes

### ❌ "Cannot find module" errors in CI

**Problem**: Generated directories being typechecked

**Fix**:
1. Add directory to `tsconfig.json` exclude:
   ```json
   "exclude": ["your-dir/**/*"]
   ```
2. Run: `npm run ci:preflight`

---

### ❌ "Parameter implicitly has 'any' type" (TS7006)

**Problem**: Function parameter missing type annotation

**Fix**:
```typescript
// ❌ Before
const handleError = (err) => { ... }

// ✅ After
const handleError = (err: Error) => { ... }
```

---

### ❌ ESLint failures

**Quick check**: `npm run lint`

**Auto-fix**: `npm run lint:fix`

---

### ❌ Test failures

**Run tests**: `npm test`

**Watch mode**: `npm run test:watch`

---

## CI Pipeline Commands

The CI runs these in order:
```bash
npm run lint          # ESLint check
npm run typecheck     # TypeScript compilation
npm run test:ci       # Jest tests
npm run check:repo    # Direct Supabase usage check
npm run check:schema  # Database schema validation
```

---

## Emergency: CI Failing After Your Push?

### Step 1: Check locally
```bash
npm run ci:preflight
```

### Step 2: If it fails locally
Fix the reported issues and push again.

### Step 3: If it passes locally but CI fails
Check for:
- Different Node.js versions (CI uses 20.x)
- Missing/outdated dependencies
- Platform-specific issues

### Step 4: Nuclear option
```bash
npm run clean
npm install
npm run ci:preflight
```

---

## Pro Tips

✅ Run `ci:preflight` before committing (even better: add to pre-commit hook)

✅ Keep `artifacts/` and `scripts/` excluded from tsconfig

✅ Use `unknown` instead of `any` when type is uncertain

✅ Fix warnings gradually - they won't block CI but should be addressed

---

## Links

- Full CI Fix Documentation: [`CI_TYPECHECK_FIX.md`](./CI_TYPECHECK_FIX.md)
- Scripts Documentation: [`scripts/README.md`](./scripts/README.md)
- TypeScript Config: [`tsconfig.json`](./tsconfig.json)

---

**Last Updated**: October 27, 2025  
**Maintained By**: Dev Team
