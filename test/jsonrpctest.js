var express = require('express')
  , request = require('supertest')
  , Promise = require('promise')
  , jsonrpc = require('../lib/jsonrpc');
var bodyParser = require('body-parser');

describe('jsonrpc', function(){
  var app = express();
  app.use(bodyParser.json());

  describe('.router', function(){
      app.post('/', jsonrpc.router.bind({
        noparams: function(params, respond) {
          respond("hello")
        },
        ping: function (params) {
          return ["hello", params];
        },
        ping_async: function (params, respond) {
          respond(["hello", params]);
        },
        ping_promise: function (params) {
          return Promise.resolve(["hello", params]);
        },
        ping_number: function (params, respond) {
          respond(params[0]);
        },
        error: function (params, respond) {
          if (params)
            return new jsonrpc.JsonRpcError(-32001, "User Error");
          else
            respond( jsonrpc.INTERNAL_ERROR );
        },
        get_data: function (params, respond) {
          respond(["hello", 5]);
        },
        dependant_method: function (params, respond, promises) {
          promises.forEach(function(p) {
            if (p.request.method == 'get_data') {
              p.then(function(result){
                respond(result.result[1]+1);
              });
            }
          });
        },
        handle_file: function (json, respond, promisesSofar, rpcSession) {
          return rpcSession.getFileRequest(json.name).then(function(fileinfo) {
            return new Promise(function(resolve, reject){
              var buffers = [];
              fileinfo.file.on('data', function(d) {
                buffers.push(d);
              }).on('end', function() {
                resolve({name: fileinfo.filename,
                  contents: Buffer.concat(buffers).toString() })
              });
           })
         });
       },
      }));

    it('should route an async jsonrpc method', function(done){
      request(app)
      .post('/')
      //.set('Content-Type', 'application/json') //unnecessary since its the default
      .send({"jsonrpc":"2.0","method":"ping_async","id":8})
      .expect('{"jsonrpc":"2.0","id":8,"result":["hello",null]}', done);
    });

    it('should route a sync jsonrpc method', function(done){
      request(app)
      .post('/')
      //.set('Content-Type', 'application/json') //unnecessary since its the default
      .send({"jsonrpc":"2.0","method":"ping","id":8})
      .expect('{"jsonrpc":"2.0","id":8,"result":["hello",null]}', done);
    });

    it('should route a promise returning jsonrpc method', function(done){
      request(app)
      .post('/')
      //.set('Content-Type', 'application/json') //unnecessary since its the default
      .send({"jsonrpc":"2.0","method":"ping_promise","id":8})
      .expect('{"jsonrpc":"2.0","id":8,"result":["hello",null]}', done);
    });

    it('should route a handle false-y looking params correctly', function(done){
      request(app)
      .post('/')
      //.set('Content-Type', 'application/json') //unnecessary since its the default
      .send({"jsonrpc":"2.0","method":"ping_number", "params":[0], "id":8})
      .expect('{"jsonrpc":"2.0","id":8,"result":0}', done);
    });

    it('should handle internal errors correctly', function(done){
      request(app)
      .post('/')
      //.set('Content-Type', 'application/json') //unnecessary since its the default
      .send({"jsonrpc":"2.0","method":"error","id":8})
      .expect( '{"jsonrpc":"2.0","id":8,"error":{"code":-32603,"message":"Internal error"}}', done);
    });

    it('should handle no such method errors correctly', function(done){
      request(app)
      .post('/')
      //.set('Content-Type', 'application/json') //unnecessary since its the default
      .send({"jsonrpc":"2.0","method":"doesntexist","id":8})
      .expect( '{"jsonrpc":"2.0","id":8,"error":{"code":-32601,"message":"Method not found","data":"doesntexist"}}', done);
    });

    it('should handle custom errors correctly', function(done){
      request(app)
      .post('/')
      //.set('Content-Type', 'application/json') //unnecessary since its the default
      .send({"jsonrpc":"2.0","method":"error",  "params":["hi"], "id":8})
      .expect( '{"jsonrpc":"2.0","id":8,"error":{"code":-32001,"message":"User Error"}}', done);
    });

    it('should handle batch requests', function(done){
      request(app)
      .post('/')
      .send([{"jsonrpc":"2.0","method":"ping",params:["foo"],"id":9}, {"jsonrpc":"2.0","method":"get_data"}, {"jsonrpc":"2.0","method":"ping",params:{named:1},"id":10}, {"jsonrpc":"2.0","method":"noparams","id":11}])
      .expect(
 '[{"jsonrpc":"2.0","id":9,"result":["hello",["foo"]]},{"jsonrpc":"2.0","id":10,"result":["hello",{"named":1}]},{"jsonrpc":"2.0","id":11,"result":"hello"}]'
        , done);
    });

    it('should send an empty response to a notification', function(done){
      request(app)
      .post('/')
      //.set('Content-Type', 'application/json') //unnecessary since its the default
      .send({"jsonrpc":"2.0","method":"get_data"})
      .expect('', done);
    });

    it('should send an empty response to an error generating notification', function(done){
      request(app)
      .post('/')
      //.set('Content-Type', 'application/json') //unnecessary since its the default
      .send({"jsonrpc":"2.0","method":"doesntexist"})
      .expect('', done);
    });

    it('should handle dependant methods', function(done){
      request(app)
      .post('/')
      .send([{"jsonrpc":"2.0","method":"get_data", "id":9}, {"jsonrpc":"2.0","method":"dependant_method","id":11}])
      .expect(
    '[{"jsonrpc":"2.0","id":9,"result":["hello",5]},{"jsonrpc":"2.0","id":11,"result":6}]'
        , done);
    });

    it('should timeout with dependant methods without the dependant', function(done){
      var timeout = setTimeout(done, 50); //expect this test to timeout
      request(app)
      .post('/')
      .send({"jsonrpc":"2.0","method":"dependant_method","id":11})
      .expect('should never get a response', done);
    });

    /* note: we need to use an old version of supertest for this to work
    /http://visionmedia.github.io/superagent/#multipart-requests
    //trying to avoid using part() like this:
      .set('Content-Type', 'multipart/form-data; boundary=--83ff53821b7c')
      .send(
    '--83ff53821b7c\r\nContent-Disposition: form-data; name="jsonrpc"\r\n\r\n'
    + json + '\r\n--83ff53821b7c\r\n'
    + 'Content-Disposition: form-data; name="dummy"; filename="dummy.txt"\r\nContent-Type: text/plain\r\n\r\nblah blah\r\n--83ff53821b7c--\r\n'
    )
  doesn't work either
  */
    it('should handle multipart requests', function(done){
      var json = JSON.stringify(
        [{"jsonrpc":"2.0","method":"handle_file", params:{name:'dummy'}, "id":1}]
      );
      var req = request(app).post('/')
      .field('jsonrpc', json)

      var part = req.part()
        .set('Content-Disposition', 'form-data; name="dummy"; filename="dummy.txt"')
        .set('Content-Type', 'text/plain');
      part.write('some dummy data');
      part.end();

     req.expect(
        '[{"jsonrpc":"2.0","id":1,"result":{"name":"dummy.txt","contents":"some dummy data"}}]'
        , done);

      }); //it

  });

})
