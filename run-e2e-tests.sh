#!/bin/bash
cp ./frontend/.env.test ./frontend/.env
npx playwright test
