var assert = require('assert'),
  loadConfig = require('../lib/config')();

describe("config", function() {
  it("should merge defaults and local", function() {
    assert(process.env.NODE_ENV==='test'); //NODE_ENV=test will always be defined
    var config = loadConfig("configtest");
    assert(config.defaultonly === true);
    assert(config.inboth === "local");
  });
});
