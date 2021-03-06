var path = require('path');
var base = require('../lib/app');
var assert = require('chai').assert;
require('should');
var request = require('supertest');

var models = require('../models');

describe('app singleton', function() {
  it("should throw if it is accessed before app creation", function() {
    assert.throws( function() {var app = base.app;} );
  });
});


describe('app', function() {
  var app;

  before(function(){
    base.createApp(__dirname, {
      //customize config dir so for config tests below
      configdir: [path.join(__dirname, 'fixtures')],
      routes: {
        index: function(req, res) {
          assert(req.app);
          res.status(200).send("derived");
        }
      }
    });
    app = base.app; //tests that app singleton is set
    app.get('/testview/*', function(req, res) {
      res.render(req.params[0], {});
    });
    app.get('/dummy.txt', function(req, res) {
      res.setHeader('Content-Disposition', 'attachment; filename=dummy.txt');
      res.setHeader('Content-Type', 'text/plain');
      res.send('some text\n');
    });
  });

  after(function(done){
    app.stop(done);
  });

  it("should start the app", function(done) {
    app.start(null, function(server){
        assert(app.get("server"));
        done();
      });
  });

  it("should use existing path if path isn't specified in an updated route", function(done) {
    request(app.getInternalUrl())
    .get('/')
    .expect(/derived/)
    .expect(200)
    .end(done);
  });

  it("should download a file", async function() {
    var url = app.getInternalUrl() + '/dummy.txt';
    var fileObj = await models.File.saveUrl(url);
    assert(fileObj);
    assert(fileObj.name === 'dummy.txt', "unexpected filename: " + fileObj.name);
    assert(fileObj.contents == 'some text\n', "unexpected contents: " + fileObj.contents);
  });

  describe('config', function() {
    it("should merge configuration files properly", function() {
      process.env.NODE_ENV.should.equal('test'); //NODE_ENV=test will always be defined
      var config = app.loadConfig("configtest");
      app.loadConfig.paths.length.should.equal(2);
      app.loadConfig.paths[0].should.equal(path.resolve(path.join(__dirname, 'fixtures')));
      config.defaultonly.should.equal(true);
      config.derivedonly.should.equal(true);
      config.inboth.should.equal("local"); //shouldn't load the derived local config
      config.derivedlocal.should.equal("derived-local");
    });

  });

  describe('email', function() {
    var template = {
      subject: "subject {{test}}",
      templatePath: "email.html",
      templateVars: {test: 'var'}
    };

    it('should send an email', function(done) {
      app.email.sendMessage('to@foo.com', template.subject,
        template.templatePath, template.templateVars).then(function(response) {
          try {
            response.response.toString().should.match(/Subject: subject var/);
            response.response.toString().should.match(/\r\ntest var\n/);
            response.envelope.to[0].should.equal('to@foo.com');
            response.envelope.from.should.equal('help@onecommons.org');
          } catch (err) {
            done(err);
            return;
          }
          done();
        }, done);
    });

    it('should send an email to a user', function(done) {
      app.email.sendToUser(template, {
        local: {email: "to@foo.com"}
      }).then(function(response) {
          try {
            response.response.toString().should.match(/Subject: subject var/);
            response.response.toString().should.match(/\r\ntest var\n/);
            response.envelope.to[0].should.equal('to@foo.com');
            response.envelope.from.should.equal('help@onecommons.org');
          } catch (err) {
            done(err);
            return;
          }
          done();
        }, done);
    });

    it('should save an rendered email', function(done) {
      var sendOn = new Date();
      models.Email.saveEmail(app, template, {
        local: {email: "to@foo.com"}
      }, {}, sendOn).then(function(email) {
        try {
          assert(email && email._id);
          email.subject.should.equal("subject var");
          email.html.should.equal("test var\n");
          email.to.should.equal('to@foo.com');
          email.from.should.equal('help@onecommons.org');
          email.status.should.equal('pending');
          email.sendNow(app).then(function(email) {
            email.status.should.equal('sent');
            done();
          }, done);
        } catch (err) {
          done(err);
        }
      }, done);
    });

  });

  describe('views', function() {
    before(function(){
      app.suppressErrorHandlerConsole = true;
    })

    after(function(){
      app.suppressErrorHandlerConsole = false;
    })

    var testapp = function(viewurl, expected, done) {
      var r = request(app.getInternalUrl()).get(viewurl).expect(expected);
      if (typeof expected !== 'number')
        r.expect(200);
      r.end(done);
    };

    [
      ['test-only-in-base', /base/],
      ['only-in-derived', /derived/],
      ['only-in-derived-base', /bd/],
      ['test-in-derived-base-and-base', /bd/],
      ['in-derived-and-derived-base', /derived/],
      ['test-in-derived-and-base', /derived/],
      ['test-in-all-three', /derived/],
      ['does-not-exist', 500],

      ['base/test-only-in-base', /base/],
      ['base/only-in-derived', 500],
      ['base/only-in-derived-base', /bd/],
      ['base/test-in-derived-base-and-base', /bd/],
      ['base/in-derived-and-derived-base', /bd/],
      ['base/test-in-derived-and-base', /base/],
      ['base/test-in-all-three', /bd/],
      ['base/does-not-exist', 500],

      ['test-in-base-includes', 'test-only-in-base:base\n\nonly-in-derived-base'+
      ':bd\n\ntest-in-derived-base-and-base:bd\n\nin-derived-and-derived-base:bd\n\ntest-in-all-three:bd\n\n'],

      ['test-in-base-includes-only-in-derived', 500],

      ['test-in-base-includes-only-in-derived-base', 'only-in-derived-base:bd\n\n'],

      ['only-in-derived-includes', 'test-only-in-base:base\n\nonly-in-derived-base'+
':bd\n\ntest-in-derived-base-and-base:bd\n\nin-derived-and-derived-base:derived\n\ntest-in-all-three:derived\n\nonly-in-derived:derived\n\n'],

      ['only-in-derived-base-includes', 'test-only-in-base:base\n\nonly-in-derived-base'+
':bd\n\ntest-in-derived-base-and-base:bd\n\nin-derived-and-derived-base:derived\n\ntest-in-all-three:derived\n\nonly-in-derived:derived\n\n'],

      ['childdir/only-in-derived-includes', 'test-only-in-base:base\n\nonly-in-derived-base'+
':bd\n\ntest-in-derived-base-and-base:bd\n\nin-derived-and-derived-base:derived\n\ntest-in-all-three:derived\n\nonly-in-derived:derived\n\n'],

      ['test-in-base-includes-base', 'base/test-only-in-base:base\n\nbase/test-in-derived-and-base'+
':base\n\nbase/test-in-derived-base-and-base:base\n\nbase/test-in-all-three:base\n\n'],

      ['test-in-base-includes-base-only-in-derived', 500],
      ['test-in-base-includes-base-only-in-derived-base', 500],
      ['only-in-derived-includes-base-derived', 500],

      ['only-in-derived-includes-base', 'base/test-only-in-base:base\n\nbase/only-in-derived-base'+
':bd\n\nbase/test-in-derived-base-and-base:bd\n\nbase/in-derived-and-derived-base:bd\n\nbase/test-in-all-three:bd\n\n'],

      ['only-in-derived-base-includes-base', 'base/test-only-in-base:base\n\n' +
       'base/test-in-derived-base-and-base:base\n\nbase/test-in-derived-and-base:base\n\nbase/test-in-all-three:base\n\n'],

      ['only-in-derived-base-includes-base-derived', 500],
      ['only-in-derived-base-includes-base-derived-base', 500],

//XXX more comprehensive subdir testing, e.g.
//from foo include bar
//from . include foo/bar
//from foo include ../baz
//from foo/a include base/bar
//from b include base/foo/bar
//from foo/a include base/../baz


    ].forEach(function(item) {
        var name = item[0], expected = item[1]
        it("should resolve to " + expected.toString().replace(/\s/g, ' ') + " when " + name, function(done) {
          testapp('/testview/'+name+'.html', expected, done);
        });
    });
  });
});
