#!/bin/bash
# Usage: run-list.sh <split> <tag> <conc> design1 design2 ...
cd "$(dirname "$0")"; split=$1; tag=$2; conc=$3; shift 3
for d in "$@"; do NODE_USE_ENV_PROXY=1 node run-design.mjs "$d" "$split" "$tag" "$conc" 2>&1 | grep '^{' | tail -1; done
