#!/usr/bin/env bash
set -euo pipefail

OUT_ROOT="artifacts"
BUNDLE_DIR="${OUT_ROOT}/catchall-cortex-bundle"
FILES_DIR="${BUNDLE_DIR}/files"
MANIFEST="${BUNDLE_DIR}/manifest.txt"
ZIP_PATH="${OUT_ROOT}/catchall-cortex-bundle.zip"

if ! command -v zip >/dev/null 2>&1; then
  echo "[ERR] 'zip' not found. Install it (macOS: brew install zip, Ubuntu: sudo apt-get install zip)." >&2
  exit 1
fi

rm -rf "${BUNDLE_DIR}" "${ZIP_PATH}"
mkdir -p "${FILES_DIR}"

IGNORE_DIRS=(
  ".git" "node_modules" "dist" "build" ".next" "out" ".expo"
  "ios" "android" "coverage" ".yarn" ".turbo" ".cache"
)

INCLUDE_DIRS=(
  "lib/cortex"
  "cortex"
  "gremly-chat-system-review"
)

CURATED_FILES=(
  "app/spaces/ChatThreadScreen.tsx"
  "app/spaces/chat/prefillUtils.ts"
  "src/hooks/useActionToast.tsx"
  "lib/chat/quickResponses.ts"
  "lib/cortex/CortexClient.ts"
  "CATCHALL_CORTEX_REFACTOR.md"
  "CATCHALL_PIPELINE_WIRING_COMPLETE.md"
  "docs/phase3-data-cortex-complete.md"
  "__tests__/intent-classification.test.ts"
  "__tests__/cortex/pipelines.wiring.test.ts"
  "__tests__/cortex/intent.explicit-actions.test.ts"
)

KEYWORD_RE='(cortex|intent|classification|catch.?all|catch-?all|mind.?drop|CortexClient|cortexDecide|router|pipelines|ActionToast|prefillUtils|ChatThreadScreen|CatchAllNotepad|CATCHALL)'

PRUNE_EXPR=()
for d in "${IGNORE_DIRS[@]}"; do
  PRUNE_EXPR+=( -name "$d" -prune -o )
done

FOUND_FILES=()
for d in "${INCLUDE_DIRS[@]}"; do
  if [[ -d "$d" ]]; then
    while IFS= read -r -d '' f; do
      FOUND_FILES+=( "${f#./}" )
    done < <(find "$d" "${PRUNE_EXPR[@]}" -type f -print0)
  fi
done

for f in "${CURATED_FILES[@]}"; do
  [[ -f "$f" ]] && FOUND_FILES+=( "$f" )
done

while IFS= read -r -d '' f; do
  FOUND_FILES+=( "${f#./}" )
done < <(
  find . "${PRUNE_EXPR[@]}" -type f \
    \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.md" -o -name "*.json" \) -print0 |
  xargs -0 -I{} sh -c '
    p="{}"; p="${p#./}"
    echo "$p" | grep -Eiq "'"$KEYWORD_RE"'" && { printf "%s\0" "$p"; exit 0; }
    sz=$(wc -c <"$p" 2>/dev/null || echo 0)
    if [ "$sz" -lt 2000000 ]; then
      grep -Eiq "'"$KEYWORD_RE"'" "$p" && { printf "%s\0" "$p"; exit 0; }
    fi
  ' 2>/dev/null
)

UNIQUE_FILES=$(printf "%s\n" "${FOUND_FILES[@]}" | sort -u)

included=0; missing=0
echo "# Catchall/Cortex bundle manifest" > "${MANIFEST}"
echo "# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "${MANIFEST}"
echo "" >> "${MANIFEST}"
echo "included:" >> "${MANIFEST}"

while IFS= read -r rel; do
  [[ -z "$rel" ]] && continue
  if [[ -f "$rel" ]]; then
    mkdir -p "${FILES_DIR}/$(dirname "$rel")"
    cp "$rel" "${FILES_DIR}/$rel"
    echo "  - $rel" >> "${MANIFEST}"
    ((included++))
  else
    ((missing++))
  fi
done <<< "${UNIQUE_FILES}"

echo "" >> "${MANIFEST}"
echo "summary:" >> "${MANIFEST}"
echo "  included: ${included}" >> "${MANIFEST}"
echo "  missing: ${missing}" >> "${MANIFEST}"

( cd "${OUT_ROOT}" && zip -r "$(basename "${ZIP_PATH}")" "$(basename "${BUNDLE_DIR}")" >/dev/null )

echo "Bundle folder: ${BUNDLE_DIR}"
echo "Zip created:   ${ZIP_PATH}"
echo "Manifest:      ${MANIFEST}"
echo "Included: ${included}, Missing (skipped): ${missing}"
