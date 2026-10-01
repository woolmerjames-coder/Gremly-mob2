#!/bin/bash
# Run several models one after another on the same split.
# Usage: ./run-many.sh <dev|holdout> <tag> <concurrency> model1 model2 ...
cd "$(dirname "$0")"
split=$1; tag=$2; conc=$3; shift 3
for m in "$@"; do
  node --import ./loader.mjs run-v3.mjs "$m" "$split" "$tag" "$conc" 2>&1 | grep -v -i "experimental" | tail -1
done
