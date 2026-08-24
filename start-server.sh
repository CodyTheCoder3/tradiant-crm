#!/bin/bash
# Tradiant CRM — keeps the dev server running, auto-restarts on crash
cd "$(dirname "$0")"
while true; do
  echo "[$(date)] Starting Tradiant CRM server..."
  ./node_modules/.bin/next dev
  echo "[$(date)] Server stopped. Restarting in 3 seconds..."
  sleep 3
done
