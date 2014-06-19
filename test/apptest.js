var base = require('../lib/app');
var assert = require('chai').assert;
require('should');
var request = require('supertest');

describe('app', function() {
  var app = base.createApp(__dirname);

  after(function(done){
    app.stop(done);
  });

  it("should start the app", function(done) {
    app.updateNamedRoutes({
      //should use existing path if path isn't specified
      index: function(req, res) {
        var response = "derived";
        res.writeHead(200, {
          'Content-Length': Buffer.byteLength(response),
          'Content-Type': req.contentType
        });
        res.end(response);
      }
    });

    app.get("dburl").should.equal(app.parent.get("dburl"));
    app.start(function(listen) {
      listen(function(server){
        assert(app.get("server") === app.parent.get("server"));
        done();
      });
    });
  });

  it("should use existing path if path isn't specified in an updated route", function(done) {
    request(app.getUrl())
    .get('/')
    .expect(/derived/)
    .expect(200)
    .end(done);
  });

});
