#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/package-common.sh"
package_common_init router "$@"
for command_name in go npm; do command -v "$command_name" >/dev/null 2>&1 || package_fail "$command_name is required"; done
[[ -f "$PACKAGE_ROOT_DIR/web/package-lock.json" ]] || package_fail 'web/package-lock.json is required; refusing a non-locked frontend install'
(cd "$PACKAGE_ROOT_DIR/web" && npm ci --no-audit --no-fund && npm run build)
build_dir="$PACKAGE_STAGE/build"
mkdir -p "$build_dir"
(cd "$PACKAGE_ROOT_DIR" && CGO_ENABLED="${CGO_ENABLED:-0}" GOOS="${GOOS:-linux}" GOARCH="${GOARCH:-amd64}" go build -trimpath -ldflags "-X github.com/yeying-community/router/common.Version=v${PACKAGE_VERSION}" -o "$build_dir/router" ./cmd/router)
package_make_root router
mkdir -p "$PACKAGE_DIR/build" "$PACKAGE_DIR/web"
install -m 0755 "$build_dir/router" "$PACKAGE_DIR/build/router"
cp -R "$PACKAGE_ROOT_DIR/web/dist" "$PACKAGE_DIR/web/dist"
for file in config.yaml.template .env.template; do [[ ! -f "$PACKAGE_ROOT_DIR/$file" ]] || cp "$PACKAGE_ROOT_DIR/$file" "$PACKAGE_DIR/"; done
package_copy_scripts "$PACKAGE_DIR/scripts"
package_strip_build_files "$PACKAGE_DIR"
package_finish_artifact service-with-assets
package_finish
