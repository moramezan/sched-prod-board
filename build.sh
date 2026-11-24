#!/bin/sh
# Copies app/ to dist/ and stamps the build sha (R6) into the meta tag and footer.
set -eu
SHA="${BUILD_SHA:-$(git rev-parse HEAD)}"
rm -rf dist && cp -R app dist
sed -i.bak "s/__BUILD_SHA__/$SHA/g" dist/index.html && rm dist/index.html.bak
echo "built $SHA"
