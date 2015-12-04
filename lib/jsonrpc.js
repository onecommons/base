var Promise = require('promise');
var Busboy = require('busboy');
var assert = require('assert');

var PARSE_ERROR_CODE = -32700,
  INVALID_REQUEST_CODE = -32600,
  METHOD_NOT_FOUND_CODE = -32601,
  INVALID_PARAMS_CODE = -32602,
  INTERNAL_ERROR_CODE = -32603;

/** @constant */
var ERROR_MESSAGES = {
  '-32700': 'Parse error',
  '-32600': 'Invalid request',
  '-32601': 'Method not found',
  '-32602': 'Invalid parameters',
  '-32603': 'Internal error'
  //-32099 to -32000 are open for use
};

function JsonRpcError(code, message, data){
  this.name = JsonRpcError.name;
  this.code = code || INTERNAL_ERROR_CODE;
  this.message = message || ERROR_MESSAGES[code] || '';
  this.data = data;
}
JsonRpcError.prototype = new Error;

var PARSE_ERROR = new JsonRpcError(-32700),
    INVALID_REQUEST = new JsonRpcError(-32600),
    METHOD_NOT_FOUND = new JsonRpcError(-32601),
    INVALID_PARAMS = new JsonRpcError(-32602),
    INTERNAL_ERROR = new JsonRpcError(-32603);

function isValidRequest(rpc) {
  //or params must be absent, an array or object
  var params = rpc.params;
  //isNaN shouldn't be used for rpc.id
  return rpc.jsonrpc === '2.0' && typeof rpc.method ==='string' && (!rpc.hasOwnProperty('id') || typeof rpc.id === 'number')
    && (typeof params === 'undefined' || (params && typeof params === 'object'));
}

function makeResult(request, responseObj) {
  var response = {
    jsonrpc: '2.0',
    id: request.id // undefined if a notification
  };
  var logdata = { jsonrpccall: {method: request.method, params: request.params}};
  var httpRequest = request.session && request.session.httpRequest || {};
  if (responseObj instanceof JsonRpcError) {
    response.error = {
      code: responseObj.code,
      message: responseObj.message
    };
    logdata.jsonrpccall.error = response.error;
    var errorData;
    if (responseObj.data) {
      if (responseObj.data instanceof Error) {
        errorData = responseObj.data.stack || responseObj.data.toString();
      } else {
        errorData = responseObj.data;
      }
      logdata.jsonrpccall.error = response.error;
      if (httpRequest.hideInternals) {
        logdata.jsonrpccall.error.data = errorData;
      } else {
        response.error.data = errorData;
      }
    }
    if (httpRequest.log) {
      httpRequest.log.warn(logdata, "error when invoking jsonrpc method");
    }
    if (httpRequest.id) {
      response.error.xid = httpRequest.id;
    }
  } else {
    response.result = responseObj;
    if (httpRequest.log) {
      logdata.jsonrpccall.result = responseObj;
      httpRequest.log.info(logdata, 'jsonrpc success');
    }
  }
  return response;
}

function setup(reqs, methods, session) {
  session.requests = reqs;
  if (methods.__pre)
    methods.__pre(session);
  return reqs.reduce(function(promisesSoFar, req) {
    var p = null;
    req.session = session;
    if (!isValidRequest(req)) {
      p = Promise.resolve(makeResult(req, INVALID_REQUEST));
    } else {
      var method = methods[req.method];
      if (!method) {
        p = Promise.resolve( makeResult(req, new JsonRpcError(METHOD_NOT_FOUND_CODE,null, req.method)) );
      } else {
        p = new Promise(function (resolve, reject) {
          var done = false;
          try {
            var respond = function(response) {
              if (done) {
                if (session.httpRequest && session.httpRequest.log)
                  session.httpRequest.log.error("jsonrpc response called more than once:", req.method, "params:", req.params);
                  return;
              }
              done = true;
              resolve(makeResult(req, response));
            }
            //copy array to record current state in order to avoid deadlock
            var ret = method.call(methods, req.params, respond, promisesSoFar.slice(0), session);
            if (typeof ret !== 'undefined') {
              if (typeof ret.then === 'function') {//it's a promise
                var sendResponse = function(result) {
                  if (done) {
                    if (session.httpRequest && session.httpRequest.log) {
                      session.httpRequest.log.error("jsonrpc promise resolved after response sent:", req.method, "params:", req.params);
                    }
                    return;
                  }
                  return makeResult(req, result)
                };
                var sendErrorResponse = function(result) {
                  if (done) {
                    if (session.httpRequest && session.httpRequest.log) {
                      session.httpRequest.log.error("jsonrpc promise rejected after response sent:", req.method, "params:", req.params);
                    }
                    return;
                  }
                  if (session.httpRequest && session.httpRequest.log) {
                    session.httpRequest.log.warn("jsonrpc method call was rejected", result, req.method);
                  }
                  if (!(result instanceof JsonRpcError)) {
                    result = new JsonRpcError(-32000, "Application error", result);
                  }
                  return makeResult(req, result)
                };
                resolve( ret.then(sendResponse, sendErrorResponse) );
              } else {
                respond(ret); //synchronous call
              }
            }
          } catch (e) {
              if (session.httpRequest && session.httpRequest.log)
                session.httpRequest.log.error(e, "unexpected error from jsonrpc method call:", req.method, "params:", req.params);
              resolve(makeResult(req, INTERNAL_ERROR));
          }
        });
      }
    }
    p.request = req;
    promisesSoFar.push(p);
    return promisesSoFar;
  }, []);
}

/**
@param {Object or Array} [body] The jsonrpc request
@param {Object} [methods] Object JSON RPC methods to invoke
@param {Object} [req] HTTP request that is the source of the jsonrpc, passed to method (optional)

Returns a promise that resolves to the JSON RPC response. Maybe null if the request only contained notifications.
*/
function handleRequest(body, methods, req, res, session) {
  var isBatch = Array.isArray(body);
  session = session || {};
  session.httpRequest = req;
  var reqs = isBatch ? body : [body];
  var p = Promise.all(setup(reqs, methods, session)).then(
   function (result) {
     if (methods.__post)
       result = methods.__post(result, session);
     //filter out notification results (they won't have an id)
     result = result.filter(function(elem){
       var keep = !!elem.id;
       return keep;
     });
     if (!result.length) {
       return null;
     }
     if (!isBatch && result.length == 1)
       return result[0];
     return result;
  });
  if (res) {
    p = p.then(function(result) {
      if (result) {
        var rpcResponse = (methods.__stringify || JSON.stringify)(result);
        var contentLength = Buffer.byteLength(rpcResponse);
        res.writeHead(contentLength ? 200 : 204, {
          'Content-Length': String(contentLength),
          'Content-Type': 'application/json'
        });
        res.end(rpcResponse);
      } else {
        res.end();
      }
    });
  }
  return p;
}

/**
Express request handler.
usage: app.post('/', router.bind(methods))

@param {Object} [req] Express request object. Assumes req.body has already been parsed into json
@param {Object} [res] Express response object.
@param {Function} [next] Called if request isn't json
*/
module.exports.router = function(req, res, next) {
  var contentType = req.headers['content-type'] || '';
  if (contentType.indexOf( 'application/json' ) > -1) {

    handleRequest(req.body, this, req, res).catch(next);

  } else if (/^(multipart\/.+)/i.test(contentType)) {
      var f = {};
      var self = this;
      function getFileRequest(n) {
        if (!f[n]) {
          f[n] = {};
          f[n].promise = new Promise(function(resolve, reject) {
            f[n].reject = reject;
            f[n].resolve = function(result) { f[n].reject = null; resolve(result); };
          });
          assert(f[n].resolve);
        }
        return f[n];
      }
      req.busboy = new Busboy({
        headers: req.headers
      })
      .on('file', function(fieldname, file, filename, encoding, mimetype) {
        getFileRequest(fieldname).resolve(
          {file:file, filename:filename, encoding:encoding, mimetype:mimetype});
      })
      .on('field', function(fieldname, val, fieldnameTruncated, valTruncated) {
        if (fieldname == (self.__jsonrpc_fieldname || 'jsonrpc')) {
          var json = JSON.parse(val);
          handleRequest(json, self, req, res,
            { getFileRequest:
                function(name) {return getFileRequest(name).promise;}
            }).catch(next);
          }
        })
      .on('finish', function() {
          //reject any file promises that haven't resolved
         Object.keys(f).forEach(function(k) {
           if (f[k].reject)
             f[k].reject(new Error('never found file ' + k));
         });
      })
      .on('error', next);

      req.pipe(req.busboy);
  } else {
    next();
  }
};

module.exports.JsonRpcError = JsonRpcError;
module.exports.handleRequest = handleRequest;
module.exports.PARSE_ERROR = PARSE_ERROR;
module.exports.INVALID_REQUEST = INVALID_REQUEST;
module.exports.METHOD_NOT_FOUND = METHOD_NOT_FOUND;
module.exports.INVALID_PARAMS = INVALID_PARAMS;
module.exports.INTERNAL_ERROR = INTERNAL_ERROR;
