#!/usr/bin/env bash

node ./node_modules/ganache-cli/cli.js \
    -a 30 \
    -e 50000000 \
    -l 9700000 \
    -p 8545 \
    -v
