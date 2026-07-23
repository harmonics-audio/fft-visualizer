#!/usr/bin/env bash
# Create a GitHub release for each package tag at HEAD that doesn't have one yet.
# Run by `pnpm release` after `changeset publish` (which creates the annotated
# tags). Pushes the release commit + tags first so gh can attach releases to
# them, then lets GitHub auto-generate notes from the changes since the last tag.
set -euo pipefail

tags=$(git tag --points-at HEAD)
if [ -z "$tags" ]; then
  echo "No tags at HEAD — nothing to release on GitHub."
  exit 0
fi

# Push the release commit and its annotated tags to the remote.
git push --follow-tags

for tag in $tags; do
  if gh release view "$tag" >/dev/null 2>&1; then
    echo "GitHub release already exists: $tag"
  else
    echo "Creating GitHub release: $tag"
    gh release create "$tag" --title "$tag" --verify-tag --generate-notes
  fi
done
