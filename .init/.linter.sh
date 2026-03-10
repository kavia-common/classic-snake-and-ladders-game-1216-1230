#!/bin/bash
cd /home/kavia/workspace/code-generation/classic-snake-and-ladders-game-1216-1230/frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

