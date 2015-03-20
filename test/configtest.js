var assert = require('assert'),
  configloader = require('../lib/config'),
  Promise = require('promise'),
  utils = require('../lib/utils');

describe("config", function() {
  it("should merge global overrides", function() {
    var loadConfig = configloader({
      configtest: {
        inboth: "overridden",
        overrideonly: true
      }
    });
    assert(process.env.NODE_ENV==='test'); //NODE_ENV=test will always be defined
    var config = loadConfig("configtest");
    assert(config.defaultonly === true);
    assert(config.inboth === "overridden");
    assert(config.overrideonly === true);
  });

  it("should merge defaults and local", function() {
    var loadConfig = configloader(); //use default paths
    assert(process.env.NODE_ENV==='test'); //NODE_ENV=test will always be defined
    var config = loadConfig("configtest");
    assert(config.defaultonly === true);
    assert(config.inboth === "local");
    assert(!config.overrideonly);
  });

});

describe("utils", function() {
  it("safeAllPromises", function(done) {
    utils.safeAllPromises([
      1,
      Promise.reject(new Error('rejected')),
      3
    ]).then(function(results) {
        assert(results.length == 3);
        assert(results[0] === 1);
        assert(results[1] instanceof Error);
        assert(results[2] === 3);
        done()
      },done);
  });

  it("popAlertMessages", function() {
    var flashfunc = function(type) {
      var msgs = {
        danger: ['msg', 'duplicated'],
        "s1.danger": ['msg2', 'duplicated'],
        "s2.danger": ['msg3'],
        "s1.success": ['another'],
        success: ['duplicated'],
      }
      return msgs[type];
    }
    var alerts = utils.popAlertMessages(flashfunc, ['danger', 'success'], ['s1', '']);
    assert.deepEqual(alerts, {
      danger: [ 'msg2', 'duplicated', 'msg' ],
      success: [ 'another', 'duplicated' ]
    });
  })
});

describe("logs", function() {
  var log = require('../lib/log');

  var outputFunc;
  before(function() {
    outputFunc = log.logger.output;
  });

  //use FATAL because it isn't filtered about by test config settings
  it("logs with formating", function(done) {
    log.logger.output = function(msg) {
      assert(msg.match("FATAL.*foo 1 bar"), msg);
      done();
    };
    log.fatal('foo %s bar', 1);
  });

  it("logs error", function(done) {
    log.logger.output = function(msg) {
      assert(msg.match(/FATAL.*\[Error: test\] foo 1 bar/), msg);
      done();
    };
    log.fatal(new Error('test'), 'foo %s bar', 1);
  });

  after(function() {
    //restore original method
    log.logger.output = outputFunc;
  });
});
