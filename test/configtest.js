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
