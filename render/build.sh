#!/usr/bin/env bash
# Render build: compiles the Rust->WASM rewriter, the Scramjet bundles, and the demo site.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="$ROOT/.render-tools"
mkdir -p "$TOOLS/bin"
export PATH="$TOOLS/bin:$HOME/.cargo/bin:$PATH"
export CARGO_HOME="$TOOLS/cargo"; mkdir -p "$CARGO_HOME"
# 1. Rust nightly + wasm target (rewriter/rust-toolchain.toml asks for nightly)
rustup toolchain install nightly --profile minimal -c rust-src -t wasm32-unknown-unknown --no-self-update || true
rustup run nightly rustc -V

# 2. wasm-bindgen CLI (must match the crate: 0.2.105)
if ! wasm-bindgen -V 2>/dev/null | grep -q "0.2.105"; then
  cargo install wasm-bindgen-cli --version 0.2.105 --locked --root "$TOOLS"
fi

# 3. Binaryen wasm-opt (prebuilt)
if ! command -v wasm-opt >/dev/null; then
  V=version_123
  curl -fsSL "https://github.com/WebAssembly/binaryen/releases/download/$V/binaryen-$V-x86_64-linux.tar.gz" | tar xz -C "$TOOLS"
  cp -r "$TOOLS/binaryen-$V/bin/." "$TOOLS/bin/"
  cp -r "$TOOLS/binaryen-$V/lib" "$TOOLS/" 2>/dev/null || true
fi

# 4. wasm-snip (r58Playz fork)
if ! command -v wasm-snip >/dev/null; then
  cargo install --git https://github.com/r58Playz/wasm-snip --locked --root "$TOOLS" wasm-snip || \
  cargo install --git https://github.com/r58Playz/wasm-snip --root "$TOOLS" wasm-snip
fi

# 5. JS deps
cd "$ROOT"
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile

# 6. Rewriter + Scramjet + controller
cd "$ROOT/packages/core"
RELEASE=1 pnpm rewriter:build
pnpm build
cd "$ROOT/packages/controller" && pnpm build

# 7. Demo site, pointing at this service's own /wisp/ endpoint
HOST="${RENDER_EXTERNAL_HOSTNAME:-localhost:${PORT:-10000}}"
if [[ "$HOST" == localhost* ]]; then SCHEME=ws; else SCHEME=wss; fi
export VITE_WISP_URL="${VITE_WISP_URL:-$SCHEME://$HOST/wisp/}"
echo "Using VITE_WISP_URL=$VITE_WISP_URL"
cd "$ROOT/packages/demo" && pnpm build
echo "Build complete: packages/demo/dist"
