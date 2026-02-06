#!/bin/sh
# Clean build script for the Zepp OS app

# Remove dist if it exists (from the app folder)
if [ -d "dist" ]; then
  rm -rf dist
fi

# Run zeus clean if it's available (from the app folder)
if command -v zeus >/dev/null 2>&1; then
  zeus clean || true
fi

# Start zeus bridge in the background
#echo "Starting zeus bridge..."
#zeus bridge &
#BRIDGE_PID=$!

# Give the bridge a second to start
sleep 2

# Start zeus dev (foreground)
echo "Starting zeus dev..."
zeus dev

# When zeus dev exits, kill the bridge
kill $BRIDGE_PID 2>/dev/null
