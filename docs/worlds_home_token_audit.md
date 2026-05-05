# WH.V Pass A — Token mapping audit

**Date:** 2026-04-28  
**Screen:** `app/tabs/WorldsScreen.tsx`  
**Spec source:** `worlds-home-spec.html` (uploaded to conversation)  
**Tokens source:** `design/tokens.ts` (lightTokens)  
**No code was changed in this pass.**

---

## Delta method

Per-channel delta = `|R_spec − R_token| / 255`, worst channel reported.  
Classification thresholds:

- **EXACT** — byte-for-byte match across all channels  
- **CLOSE** — worst channel ≤ ~8% (acceptable reuse candidate; design review required)  
- **NEW** — worst channel > ~8%, no sufficiently close token exists

---

## Section 1 — Spec base palette → existing tokens

| Spec name | Spec hex | Closest existing token | Existing hex | Delta (worst channel) | Classification | Recommendation |
|---|---|---|---|---|---|---|
| Cream (page bg) | `#F5EFE3` | `linenCreamLight` | `#F3EFE8` | B: 2% | CLOSE | Reuse `linenCreamLight` (≈2% cooler blue-green tinge) **or** add new token `worldsHomeBg #F5EFE3` to preserve spec warmth exactly |
| Paper (card surface) | `#FFFFFF` | `worldsCard` / `surface` | `#FFFFFF` | 0% | EXACT | Reuse `worldsCard` |
| Ink (primary text) | `#1F3A2E` | `worldsInk` / `deepForest` | `#1A3328` | R: 2%, G: 3%, B: 2% | CLOSE | Reuse `worldsInk` (≈2–3% lighter/warmer) **or** add new token `worldsHomeInk #1F3A2E` |
| Ink soft (secondary text, chapter lines) | `#5A6B5F` | `warmGrey` | `#7A7665` | R: 8%, G: 7%, B: 6% | NEW | Add new token — no close match in token set; `warmGrey` is 8% darker and browner |
| Mute (eyebrows, section labels) | `#8C8479` | `warmGrey` | `#7A7665` | R: 7%, G: 5%, B: 8% | CLOSE | Reuse `warmGrey` (≈7% darker/cooler) **or** add new token `worldsMute #8C8479`; warmGrey is the intended semantics |
| Mute light (world card status row) | `#9C9387` | `warmGrey` | `#7A7665` | R: 13%, G: 11%, B: 13% | NEW | Add new token — `warmGrey` is 13% darker; no suitable lighter neutral grey exists |
| Mute lighter (closed card meta) | `#B5AC9C` | `chapterBannerMuted` | `#B4B2A9` | R: <1%, G: 2%, B: 3% | CLOSE | Reuse `chapterBannerMuted` (≈2–3% warmer/tan) — semantically muted text, acceptable |
| Status dot (Growing/Steady/Active) | `#7A9A7E` | `sageGreen` | `#97AF8F` | R: 10%, G: 8%, B: 1% | NEW | Add new token — `sageGreen` is 8–10% lighter; `velocityDotGrowing` is the same as `sageGreen`; spec dot is distinctly darker |
| Mustard (editorial accent, retained) | `#C9A55C` | `ambergold` | `#C19858` | R: 3%, G: 5%, B: 2% | CLOSE | Reuse `ambergold` (≈4% lighter) **or** add new token; spec description says "retained" so adding new may be preferable for precision |
| Hairline (hero ↔ grid divider) | `rgba(31,58,46,0.10)` | none | — | — | NEW | Add new rgba token or derive inline as `rgba(worldsInk-rgb, 0.10)`; note ink base is CLOSE (not exact) to `worldsInk` |
| Hairline soft (between body items) | `rgba(31,58,46,0.06)` | none | — | — | NEW | Same as above at opacity 0.06 |

---

## Section 2 — Spec world accents → existing tokens

| Spec name | Spec hex | Closest existing token | Existing hex | Delta (worst channel) | Classification | Recommendation |
|---|---|---|---|---|---|---|
| Gremly App | `#94A88C` | `sageGreen` | `#97AF8F` | R: 1%, G: 3%, B: 1% | CLOSE | Reuse `sageGreen` (≈2–3% lighter) **or** add new token for precision; note this hex also appears in the mascot palette (body · world card) |
| Health | `#B0A6C8` | `noticedBorder` | `#A299C9` | R: 5%, G: 5%, B: <1% | CLOSE | Reuse `noticedBorder` (≈5% lighter/more neutral, less purple) **or** add new token; `noticedBorder` has "noticed" semantics which may cause confusion |
| Fitness | `#D8C4A4` | `oatDeeper` | `#DDD3B8` | G: 6%, B: 8% | CLOSE | Reuse `oatDeeper` (≈6–8% cooler/darker warm-oat tone) **or** add new token; `oatDeeper` is currently used for card borders |
| Family | `#E0B8B0` | `closedTagBg` | `#F2D5C5` | R: 7%, G: 11%, B: 8% | NEW | Add new token — no close match; `closedTagBg` is 11% lighter and more salmon-orange |
| Sage at Work | `#A8A8A8` | `chapterBannerMuted` | `#B4B2A9` | R: 5%, G: 4%, B: 8% | CLOSE | Reuse `chapterBannerMuted` (≈5–8% off, also has slight warm tinge vs spec's pure neutral grey) **or** add neutral grey token |
| Home | `#BDB098` | `chapterBannerMuted` | `#B4B2A9` | R: 4%, G: 1%, B: 7% | CLOSE | Reuse `chapterBannerMuted` (≈4–7% warmer/tan tinge) **or** add new token; spec Home is more distinctly tan/sand vs the cooler grey |

---

## Section 3 — Spec arc-type colors → existing tokens

| Spec name | Spec hex | Closest existing token | Existing hex | Delta (worst channel) | Classification | Recommendation |
|---|---|---|---|---|---|---|
| Social pressure | `#8973A8` | `noticedLabel` | `#7A6EB2` | R: 6%, G: 2%, B: 4% | CLOSE | Reuse `noticedLabel` (≈5% darker/more saturated purple-violet) — but `noticedLabel` has "noticed" semantics; recommend add new token `arcSocialPressure #8973A8` |
| Hardening | `#4F6B5C` | `mossGreen` | `#2E5540` | R: 13%, G: 9%, B: 11% | NEW | Add new token `arcHardening #4F6B5C` — mid-forest green; `mossGreen` is 9–13% darker |
| Consistency | `#B58A45` | `ambergold` | `#C19858` | R: 5%, G: 5%, B: 8% | CLOSE | Reuse `ambergold` (≈5–7% lighter/more golden) **or** add new token `arcConsistency #B58A45`; spec hue is noticeably darker/earthier than ambergold |

---

## Section 4 — Spec mascot tints → existing tokens

| Spec name | Spec hex | Closest existing token | Existing hex | Delta (worst channel) | Classification | Recommendation |
|---|---|---|---|---|---|---|
| Body · world card (uniform) | `#94A88C` | `sageGreen` | `#97AF8F` | R: 1%, G: 3%, B: 1% | CLOSE | Same as Gremly App world accent above — reuse `sageGreen` or add shared token |
| Body · header | `#A8A6B6` | `noticedBorder` | `#A299C9` | R: 2%, G: 5%, B: 8% | NEW | Add new token `mascotBodyHeader #A8A6B6` — muted blue-grey; `noticedBorder` is 8% more purple; no neutral grey-violet token exists |
| Legs · header | `#7E7B95` | `noticedLabel` | `#7A6EB2` | R: 2%, G: 5%, B: 11% | NEW | Add new token `mascotLegsHeader #7E7B95` — muted purple-grey; `noticedLabel` is 11% more blue-violet |
| Eyes (all mascots) | `#1F3A2E` | `worldsInk` | `#1A3328` | R: 2%, G: 3%, B: 2% | CLOSE | Reuse `worldsInk` — same classification as spec Ink above; eyes are ink-colored |
| Diamond / chest emblem | `#D8B86A` | `ambergold` | `#C19858` | R: 9%, G: 12%, B: 7% | NEW | Add new token `mascotDiamond #D8B86A` — lighter/more gold than `ambergold`; 9–12% delta too large to reuse |

---

## Section 5 — Inline hex literals currently in `components/worlds/`

Only one inline hex literal found anywhere under `components/worlds/` (the spec does not affect this value):

| File:line | Literal | Context excerpt | Spec touches this? |
|---|---|---|---|
| `components/worlds/sections/UnfoldingSection.tsx:82` | `#000` | `shadowColor: '#000'` | No — shadow colors are not part of the spec palette and this is a standard RN shadow |

All other color values in `components/worlds/` are consumed via `lightTokens` from `design/tokens.ts`. No additional inline hex literals were found.

---

## Summary: token actions required for Pass B

| Action | Count | Tokens |
|---|---|---|
| **EXACT reuse** | 1 | `worldsCard` (Paper) |
| **CLOSE — reuse decision needed** | 14 | Cream→linenCreamLight, Ink→worldsInk, Mute→warmGrey, Mute lighter→chapterBannerMuted, Mustard→ambergold, Gremly App→sageGreen, Health→noticedBorder, Fitness→oatDeeper, Sage at Work→chapterBannerMuted, Home→chapterBannerMuted, Social pressure→noticedLabel, Consistency→ambergold, Body·worldCard→sageGreen, Eyes→worldsInk |
| **NEW — must add if spec hex is exact** | 11 | Ink soft, Mute light, Status dot, Hairline, Hairline soft, Family, Hardening, Body·header, Legs·header, Diamond, and Pill ×2 (or 12 counting Pill as 2) |

**Net new tokens if all NEW items are added:** 12  
**Net new tokens if CLOSE items resolve to "add new":** up to 14 additional  
**Minimum new tokens (only the pure-NEW cases):** 12
