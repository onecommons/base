onecommons base
===============

Building blocks for building an app using express, mongo and passport

## To Install

1. run `npm install` after cloning repo (use `npm ls` to verify dependencies)
2. install mongodb: e.g. sudo brew install mongodb; sudo mkdir -p /data/db; sudo chown `id -u` /data/db

## To Run

To run app, in two consoles run:

```
ulimit -n 1024 & sudo mongod

DEBUG=express:* node index.js
```

## To create a new app
1. `npm install https://github.com/onecommons/base.git`
2. 
```
var base = require("base");
var app = base.createApp(__dirname);
//add your app routes:
//app.get(...
app.start()
```

## Tests

Run unit tests:

```
NODE_ENV=test ./node_modules/.bin/mocha --reporter=list
```

## Debugging

```npm install -g node-inspector```

debug app:

```node-debug app.js```

debug unit tests:

```
NODE_ENV=test ./node_modules/.bin/mocha --reporter=list --debug-brk
node-inspector
```
