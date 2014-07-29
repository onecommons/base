var mongoose = require('mongoose');
var fs   = require('fs');
var path = require('path');
var assert = require('chai').assert;
var express = require('express');
var util = require('util');
var EventEmitter = require("events").EventEmitter;

var Browser = require("zombie");
describe('zombietest', function() {
  var app;
  before(function(done) {
    app = require('./fixtures/app')();
    app.testresults = new EventEmitter();
    app.addBrowserTests();
    app.post('/testresult', function (req, res) {
      app.testresults.emit('clienttestresults', req.body);
      res.send( '"OK"', 200 );
    });

    app.start(function(listen) {
     mongoose.connection.db.dropCollection('dbtest1', function(err, result) {
        //may or may not exits, if it doesn't err will be set
        //console.log("dropCollection", err, result);
        listen(function(server) {
          done();
        });
      });
    });
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
        var stats = null;
        var msg = '';
        var testresults = null;
        var browser = new Browser({ debug: false, silent: true, waitFor: 100});
        browser.on("console", function(level, message) {
          console.log('from zombie browser console:', level, message);
        });
        app.testresults.once('clienttestresults', function(data) {
          testresults = data;
          stats = data.stats;
          console.log(file + " tests: " + stats.tests + " passes: " + stats.passes +
                    " failures: " + stats.failures);
          if(stats.failures > 0){
             for(var i=0; i < data.failures.length; i++){
                 msg += "FAILURE: " + data.failures[i].fullTitle + '\n';
                 msg += data.failures[i].error;
             }
          }
          msg += stats.failures + " test(s) in " + file + " failed";
        });

        var url = app.getUrl();
        assert(url);
        browser.visit(url+'/browsertest/'+file+'?xhr', function() {
          if (browser.errors.length)
            console.dir(browser.errors);
          assert(browser.errors.length == 0, "there are browser errors, see console");
          assert(stats, "no stats!");
          assert(stats.failures === 0, msg);
          assert(stats.passes > 0, "no tests detected");
          done();
        });
      });
  });

}); // describe ...
