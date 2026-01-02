#!/bin/bash
source .venv/bin/activate

echo "Running unit tests..."
pytest
if [ $? -ne 0 ]; then
    echo "Tests failed! Aborting deployment."
    exit 1
fi

echo "Tests passed. Deploying to Android..."
briefcase run android -u -r -d 3C221FDJG0026D
