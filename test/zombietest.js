/*
Note: you can run these test in a real browser interactively
by running `NODE_ENV=test node test/lib/app.js `
(note that logging is effectively disabled in test/config/app.js)
*/

var mongoose = require('mongoose');
var fs   = require('fs');
var path = require('path');
var assert = require('chai').assert;
var express = require('express');
var util = require('util');
var EventEmitter = require("events").EventEmitter;
var Browser = require("zombie");

function createTest(app, path, done) {
  var stats = null;
  var msg = '';
  var browser = new Browser({ debug: false, silent: true, waitFor: 100});
  browser.on("console", function(level, message) {
    console.log('from zombie browser console:', level, message);
  });
  app.testresults.once('clienttestresults', function(data) {
    stats = data.stats;
    console.log(path + " tests: " + stats.tests + " passes: " + stats.passes +
              " failures: " + stats.failures);
    if(stats.failures > 0){
       for(var i=0; i < data.failures.length; i++){
           msg += "FAILURE: " + data.failures[i].fullTitle + '\n';
           msg += data.failures[i].error;
       }
    }
    msg += stats.failures + " test(s) in " + path + " failed";
  });

  var url = app.getInternalUrl();
  assert(url);

  function cb() {
    if (browser.errors.length) {
      console.log("found browser errors:");
      console.dir(browser.errors);
    }
    assert(browser.errors && browser.errors.length == 0, "there are browser errors, see console");
    assert(stats, "no stats!");
    assert(stats.failures === 0, msg);
    assert(stats.passes > 0, "no tests detected");
    if (done) done();
  }

  return [browser, url + path +'?xhr', cb]
}

function getFileContents(fileinfo) {
  return new Promise(function(resolve, reject) {
      var buffers = [];
      fileinfo.file.on('data', function(d) {
        buffers.push(d);
      })
      .on('end', function() {
        resolve(Buffer.concat(buffers));
      });
  });
}

describe('zombietest', function() {
  var app;

  function runTest(path, done) {
    let [browser, url, cb] = createTest(app, path, done);
    browser.visit(url, cb)
  }

  before(function(done) {
    app = require('./lib/app')();
    app.testresults = new EventEmitter();
    app.addBrowserTests();

    //test/public/mocha.js has a XHRReporter that posts json to /testresult
    app.post('/testresult', function (req, res) {
      app.testresults.emit('clienttestresults', req.body);
      res.status(200).send( '"OK"');
    });
    app.start(function() {
        //note: may or may not exits, if it doesn't err will be set
        return mongoose.connection.db.dropCollection('DbTest1');
    }, function(server){
        console.log('test app started'); done();
    }).catch(done);
  });

  after(function(done){ app.stop(done);})

  beforeEach(function(done) {
    app.testresults.removeAllListeners();
    done();
  });

  fs.readdirSync('./test/public/tests').filter(function(file){
      // Only keep the .js files
      return file.substr(-3) === '.js';
  }).forEach(function(file){
      it(file, function(done) {
        runTest('/browsertest/'+file, done);
      });
  });

  it("run binder tests", function(done) {
    runTest('/tests/binder_tests.html', done);
  });

if (Browser.VERSION.charAt(0) > "3") {

    it("should run upload tests", async function() {
      //add file upload methods
      var jsonrpcRouter = require('../routes/datarequest');

      jsonrpcRouter.methods.succeed = async function(json, respond, promisesSofar, rpcSession) {
        return {filefieldname: json.name};
        /*
        XXX can't run these tests because zombie/lib/fetch's FormData.append doesn't support
        file uploads (see TODO comment there and uploadedFile() in zombie/dom/forms for how it could be fixed)
        try {
          assert(json.name == "testfile");
          let fileinfo = await rpcSession.getFileRequest(json.name);
          assert(fileinfo.filename == 'sometext.txt');
          let contents = await getFileContents(fileinfo);
          assert(contents == 'some text');
          return {filefieldname: json.name};
         } catch (e) {
           //note: this will generate error sent to client, won't get caught by mocha
           assert(false, "unexpected error in fileupload method: " + e);
         }
         */
      };

      jsonrpcRouter.methods.fail = function(json, respond, promisesSofar, rpcSession) {
        assert(json.name == "testfile");
        throw Error('failed');
      }

      let [browser, url, cb] = createTest(app,"/dbuploadtest");
      await browser.visit(url);
      const filename = `${__dirname}/fixtures/sometext.txt`;
      //attach files to all the file input controls
      var fields = browser.queryAll('form')
      for (let field of fields) {
        browser.attach('#'+field.id + " input[type=file]", filename);
      }
      await browser.pressButton('Run tests');
      cb();
   });
}

});
