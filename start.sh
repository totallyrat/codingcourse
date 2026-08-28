#!/usr/bin/env bash
# Codeling - run from source on macOS or Linux.
# Needs Node.js 20 or newer. To build an installer instead: npm run dist
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js was not found. Install it from https://nodejs.org and try again."
  echo
  exit 1
fi

if [ ! -d node_modules ]; then
  echo
  echo "  First run - installing dependencies. This takes a minute or two."
  echo
  npm install
fi

echo
echo "  Starting Codeling..."
echo
npm run dev
