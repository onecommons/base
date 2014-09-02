var assert = require('assert'),
  configloader = require('../lib/config');

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
