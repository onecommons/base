var assert = require('assert'),
  configloader = require('../lib/config'),
  Promise = require('promise'),
  utils = require('../lib/utils');

describe("config", function() {
  it("should merge global overrides", function() {
    var loadConfig = configloader({
      configtest: {
        inboth: "overridden",
        overrideonly: true,
        nested: {
          c: true
        }
      }
    });
    assert(process.env.NODE_ENV==='test'); //NODE_ENV=test will always be defined
    var config = loadConfig("configtest");
    assert.equal(config.defaultonly, true);
    assert.equal(config.inboth, "overridden");
    assert.equal(config.overrideonly, true);
    //test deep merge
    assert.deepEqual(config.nested, {a:true, b:true, c:true});
  });

  it("should merge defaults and local", function() {
    var loadConfig = configloader(); //use default paths
    assert(process.env.NODE_ENV==='test'); //NODE_ENV=test will always be defined
    var config = loadConfig("configtest");
    assert.equal(config.defaultonly, true);
    assert.equal(config.inboth, "local");
    assert.deepEqual(config.nested, {a:true, b:true});
    assert(!config.overrideonly);
  });

  it("should merge default and node_env/local", function() {
    //if there isn't a NODE_ENV/config/config.js it should use config/config.js
    //test that config/email.js and test/config/email.local.js merge
    var loadConfig = configloader(); //use default paths
    assert(process.env.NODE_ENV==='test'); //NODE_ENV=test will always be defined
    var config = loadConfig("email");
    assert.strictEqual(config.templates.signup.templateName, 'test');
    assert.strictEqual(config.templates.signup.templatePath, null);
    assert.strictEqual(config.templates.signup.subject, "Welcome to {{appname}}!");
  });

  it("should merge with environment variables", function() {
    var loadConfig = configloader(); //use default paths
    assert(process.env.NODE_ENV==='test'); //NODE_ENV=test will always be defined
    process.env.CONFIGTEST_inboth = 'env';
    process.env.CONFIGTEST_envonly = true;
    process.env['CONFIGTEST_nested__d'] = true;
    process.env['CONFIGTEST_nested__a'] = null;
    process.env['CONFIGTEST_N1__N2__a'] = 1;
    process.env['CONFIGTEST_N1__N2'] = '{"B":2}';
    process.env['CONFIGTEST_N3'] = 1;
    process.env['CONFIGTEST_N3__a'] = 2;

    var config = loadConfig("configtest");
    assert.strictEqual(config.defaultonly, true);
    assert.strictEqual(config.envonly, true);
    assert.equal(config.inboth, "env");
    assert.deepEqual(config.nested, {a:null, b:true, d:true});
    assert.deepEqual(config.N1, {N2:{a:1, B:2}});
    // CONFIGTEST_N3.A is ignored, CONFIGTEST_N3 is unchanged:
    assert.deepEqual(config.N3, 1);
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

describe("truncate", function() {
  var truncate = require('../lib/truncate')({
    MAXKEYS:   2,
    MAXARRAY:  3,
    MAXSTRING: 13,
  });
  var morethan10 = "more than 10 characters";
  var lessthan10 = "< 10";

  it("strings", function() {
    assert(truncate(morethan10), "more than ...");
    assert(truncate(lessthan10) === lessthan10);
  });

  it("objects", function() {
    var smallObj = {a:1, b:null};
    assert.deepEqual(truncate({a:null, b:2, c:3}), {a:null, '...':2 });
    assert.deepEqual(truncate({a:1, b:[1, morethan10]}), { a: 1, b: [ 1, 'more than ...' ] });
    assert.strictEqual(truncate(smallObj), smallObj);
    var deep = {
      a: {
        b: {
          c: 1
        }
      }
    };
    assert.strictEqual(truncate(deep), deep);

    var tooDeep = {
      a: {
        b: {
          c: {
            d: 1
          }
        }
      }
    };
    assert.deepEqual(truncate(tooDeep), { a: { b: { c: '...' } } });

    var recursive = {a:1, b:2, c:3};
    recursive.a = recursive;
    var truncated = { a: '...', '...':2 };
    assert.deepEqual(truncate(recursive), truncated);
  });

  it("arrays", function() {;
    var smallArray = [1, null, 3];
    assert.deepEqual(truncate([null, 2, 3, 4]), [ null, 2, '...' ]);
    assert.deepEqual(truncate([1, morethan10]), [ 1, 'more than ...' ]);
    assert.strictEqual(truncate(smallArray), smallArray);

    var deep = [ [[1]] ];
    assert.strictEqual(truncate(deep), deep);

    var tooDeep = [ [[ [1] ]] ];
    assert.deepEqual(truncate(tooDeep), [ [ [ '...' ] ] ]);

    var recursive = [1, 2, 3];
    recursive[0] = recursive;
    var truncated = [ '...', 2, 3 ];
    assert.deepEqual(truncate(recursive), truncated);
  });

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
