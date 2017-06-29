OneCommons Base
===============

An easily extendable base for building webapp with express, mongo and passport.

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
```
git clone https://github.com/onecommons/base-example.git`
cd base-example
npm install
edit app.js
```

## Tests

Run unit tests:

```
NODE_ENV=test ./node_modules/.bin/mocha --compilers js:babel/register --reporter=list
```

Code coverage:

```
NODE_ENV=test istanbul cover ./node_modules/.bin/_mocha --reporter=list
```

## Debugging

```npm install -g node-inspector```

debug app:

```node-debug app.js```

debug unit tests:

```
NODE_ENV=test ./node_modules/.bin/mocha --reporter=list --debug-brk -t 999999
node-inspector
```
