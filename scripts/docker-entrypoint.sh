#!/bin/sh
set -e

APP_DIR=$(pwd)
cd /workspace

HASH_FILE="/workspace/node_modules/.pnpm-lock-hash"
LOCK_FILE="/workspace/node_modules/.install-lock"
CURRENT_HASH=$(md5sum /workspace/pnpm-lock.yaml 2>/dev/null | cut -d' ' -f1 || echo "none")

# Wait for any ongoing installation by another container
WAIT_COUNT=0
while [ -f "$LOCK_FILE" ] && [ $WAIT_COUNT -lt 90 ]; do
  echo "[entrypoint] Waiting for dependency installation..."
  sleep 2
  WAIT_COUNT=$((WAIT_COUNT + 1))
done

# Remove stale lock if wait timed out
if [ -f "$LOCK_FILE" ]; then
  echo "[entrypoint] Stale lock detected, removing..."
  rm -f "$LOCK_FILE"
fi

# Detect broken symlinks (e.g. Windows host pnpm install creates /mnt/host/... paths)
NEED_INSTALL=false
if [ ! -f "$HASH_FILE" ] || [ "$(cat "$HASH_FILE" 2>/dev/null)" != "$CURRENT_HASH" ]; then
  NEED_INSTALL=true
elif [ -d "/workspace/node_modules/.pnpm" ]; then
  # Quick sanity check: pick known symlinks (root + app-level) and verify they resolve
  for TEST_LINK in \
    /workspace/node_modules/typescript \
    /workspace/node_modules/reflect-metadata \
    "$APP_DIR/node_modules/.package-lock.json" \
  ; do
    if [ -L "$TEST_LINK" ] && [ ! -e "$TEST_LINK" ]; then
      echo "[entrypoint] Detected broken symlinks in node_modules, forcing reinstall..."
      NEED_INSTALL=true
      break
    fi
  done
  # Also check app-level node_modules for broken symlinks (Windows host pnpm issue)
  if [ "$NEED_INSTALL" = false ] && [ -d "$APP_DIR/node_modules" ]; then
    FIRST_LINK=$(find "$APP_DIR/node_modules" -maxdepth 1 -type l | head -1)
    if [ -n "$FIRST_LINK" ] && [ ! -e "$FIRST_LINK" ]; then
      echo "[entrypoint] Detected broken symlinks in $APP_DIR/node_modules, forcing reinstall..."
      NEED_INSTALL=true
    fi
  fi
fi

# Install dependencies
if [ "$NEED_INSTALL" = true ]; then
  mkdir -p /workspace/node_modules
  touch "$LOCK_FILE"

  # Cleanup lock on exit (crash, signal, etc.)
  cleanup_lock() { rm -f "$LOCK_FILE"; }
  trap cleanup_lock EXIT INT TERM

  echo "[entrypoint] Installing dependencies..."
  pnpm install --frozen-lockfile

  echo "$CURRENT_HASH" > "$HASH_FILE"
  rm -f "$LOCK_FILE"

  # Reset trap after successful install
  trap - EXIT INT TERM
fi

# Always build shared libraries (fast, ensures latest source)
echo "[entrypoint] Building shared library..."
pnpm --filter @onyu/shared build 2>&1 || true
# Build bot-api-client if it has a build script and dist doesn't exist
if [ -f "/workspace/libs/bot-api-client/package.json" ] && [ ! -d "/workspace/libs/bot-api-client/dist" ]; then
  echo "[entrypoint] Building bot-api-client library..."
  cd /workspace/libs/bot-api-client && npx tsc --skipLibCheck 2>&1 || true
  cd /workspace
fi

cd "$APP_DIR"
echo "[entrypoint] Starting application..."
exec "$@"
