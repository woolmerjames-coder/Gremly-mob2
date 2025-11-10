# Overlay V2 — Phase 7 (Gateway enforcement)

This file records Phase‑7 rollout notes and operational guidance for enforcing a single overlay entrypoint.

Summary
-------
- Unified entrypoint: `OverlayComponent` exposed from `@/components/overlay` (gateway) is the single public surface for rendering overlays.
- `UnifiedCreateOverlay` has been marked LEGACY — do not import it directly.

Policy
------
- ESLint rule (`no-restricted-imports`) forbids direct imports of `@/components/overlay/UnifiedCreateOverlay` with a helpful message directing callers to use the gateway.
- CI enforces linting early (`npm run lint -- --quiet`) so the job fails fast when the rule is violated.
- A small repository test (`scripts/test-forbidden-imports.test.ts`) runs in CI to catch accidental references in comments or docs.

Developer guidance
------------------
- Replace direct imports like:

```ts
import { UnifiedCreateOverlay } from '@/components/overlay/UnifiedCreateOverlay';
```

with the canonical gateway import:

```ts
import { OverlayComponent } from '@/components/overlay';
```

- Tests are exempted from the ESLint restricted-imports rule to permit migration scaffolding and focused integration tests.

Why
---
- Consolidating the public surface reduces coupling to implementation details and lets runtime selection (V2 vs V1 vs legacy manual fallback) be controlled by feature flags and a single place — the gateway.

Related artifacts
-----------------
- ESLint configuration: `eslint.config.js` (no-restricted-imports entry)
- CI workflow: `.github/workflows/ci.yml` (lint step added)
- Repo test: `scripts/test-forbidden-imports.test.ts`
