#!/bin/bash

cd `dirname $0`

rm -f node_modules
ln -s node_modules_intel node_modules

# kill old processes
ps | grep app.js | grep -v grep | awk '{print $1}' | xargs kill

mkdir -p uploads


while :
do
  node app/app.js
  echo "the program has crashed.  restarting"
  sleep 2
done

