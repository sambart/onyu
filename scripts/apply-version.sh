#!/bin/bash
set -e

NEW_VERSION=$1
if [ -z "$NEW_VERSION" ] || [ "$NEW_VERSION" == "no-bump" ]; then
  echo "No version bump needed"
  exit 0
fi

# package.json 3곳 업데이트
pnpm version "$NEW_VERSION" --no-git-tag-version
pnpm --filter @onyu/api version "$NEW_VERSION" --no-git-tag-version
pnpm --filter @onyu/web version "$NEW_VERSION" --no-git-tag-version

echo "Updated all package.json to v${NEW_VERSION}"
