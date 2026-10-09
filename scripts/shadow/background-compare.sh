#!/usr/bin/env bash
# The narrower writers side by side on real weeks (James, 18 Oct): each job
# run in the shadow for each person under each setting, with what every model
# call was told kept (SHADOW_KEEP_PROMPTS), then read blind by
# background-judge.mjs. Writes nothing live.
#
#   ROOT=<dir outside the repo> USERS=<id>,<id> scripts/shadow/background-compare.sh
#   JOBS   words,person-words,memories,review,person-question,chapter-questions (the default)
#   CONDS  off,on,on-thinking,on-sonnet (the default; the first is the base)
#     off          as it ships: no background
#     on           Gremly's read of their life as background (LIFE_MAP_BACKGROUND)
#     on-thinking  the same, with the writer thinking harder (medium, high where it ships at medium)
#     on-sonnet    the same, with Sonnet writing at medium effort
#   JUDGE_ONLY=1 reads the runs already in ROOT again, without running them
#
# ROOT holds real words: keep it outside the repo. Keys come from the
# environment, as for run.sh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TREE="$(cd "$HERE/../.." && pwd)"
ROOT="${ROOT:?ROOT is a folder outside the repo}"
USERS="${USERS:?USERS is a comma list of user ids}"
JOBS="${JOBS:-words,person-words,memories,review,person-question,chapter-questions}"
CONDS="${CONDS:-off,on,on-thinking,on-sonnet}"
SONNET="${SONNET:-anthropic:claude-sonnet-5-5}"
case "$ROOT" in "$TREE"/*) echo "ROOT must be outside the repo" >&2; exit 1 ;; esac

# the effort and model names each job's writer reads
effort_job() { case "$1" in words) echo WORDS ;; person-words) echo PERSON_WORDS ;; memories) echo MEMORY ;; review) echo REVIEW ;; person-question) echo PEOPLE_QUESTIONS ;; chapter-questions) echo CHAPTER_QUESTIONS ;; esac; }
model_job() { case "$1" in words | person-words) echo WORDS ;; memories) echo MEMORY ;; review) echo REVIEW ;; person-question) echo PERSONQUESTION ;; chapter-questions) echo CHAPTERQUESTION ;; esac; }
harder() { case "$1" in memories | review) echo high ;; *) echo medium ;; esac; }
extra() { case "$1" in person-question) echo --even-if-waiting ;; memories) echo --limit 6 --any-closed ;; *) echo ;; esac; }

run_one() {
  local cond="$1" job="$2" user="$3"
  local -a vars=(SHADOW_KEEP_PROMPTS=1 "SHADOW_OUT=$ROOT/$cond")
  case "$cond" in
    off) vars+=(LIFE_MAP_BACKGROUND=off) ;;
    on) vars+=(LIFE_MAP_BACKGROUND=on) ;;
    on-thinking) vars+=(LIFE_MAP_BACKGROUND=on "CONTEXT_EFFORT_$(effort_job "$job")=$(harder "$job")") ;;
    on-sonnet) vars+=(LIFE_MAP_BACKGROUND=on "CONTEXT_EFFORT_$(effort_job "$job")=medium" "CONTEXT_MODEL_$(model_job "$job")=$SONNET") ;;
    *) echo "no such setting: $cond" >&2; return 1 ;;
  esac
  mkdir -p "$ROOT/$cond" "$ROOT/logs"
  # shellcheck disable=SC2046
  env "${vars[@]}" bash "$HERE/run.sh" "$job" --user "$user" $(extra "$job") > "$ROOT/logs/$cond-$job-${user:0:8}.log" 2>&1 \
    || echo "failed: $cond $job ${user:0:8} (see logs)" >&2
}

if [ "${JUDGE_ONLY:-}" != "1" ]; then
  IFS=',' read -r -a jobs <<< "$JOBS"
  IFS=',' read -r -a users <<< "$USERS"
  IFS=',' read -r -a conds <<< "$CONDS"
  for job in "${jobs[@]}"; do
    echo "running $job"
    for user in "${users[@]}"; do
      for cond in "${conds[@]}"; do run_one "$cond" "$job" "$user" & done
    done
    wait
  done
fi

BUNDLE="$HERE/.bundle-judge-$$.mjs"
trap 'rm -f "$BUNDLE"' EXIT
(cd "$TREE" && ${ESBUILD:-npx esbuild} scripts/shadow/background-judge.mjs --bundle --platform=node --format=esm --packages=external --log-level=warning --outfile="$BUNDLE")
node "$BUNDLE" --root "$ROOT" --conds "$CONDS" --users "$USERS" --jobs "$JOBS" ${JUDGES:+--judges "$JUDGES"}
