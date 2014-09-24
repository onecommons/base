var Promise = require('promise');

var PARSE_ERROR_CODE = -32700,
  INVALID_REQUEST_CODE = -32600,
  METHOD_NOT_FOUND_CODE = -32601,
  INVALID_PARAMS_CODE = -32602,
  INTERNAL_ERROR_CODE = -32603;

/** @constant */
ERROR_MESSAGES = {
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
JsonRpcError.prototype = Error.prototype;
JsonRpcError.name = 'JsonRpcError';

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
    id: request.id //undefined if a notification
  };
  if (responseObj instanceof JsonRpcError) {
    response.error = {
      code: responseObj.code,
      message: responseObj.message,
      data: responseObj.data
    };
  } else {
    response.result = responseObj;
  }
  return response;
}

function setup(body, methods, nodeReq) {
  var reqs = Array.isArray(body) ? body : [body];
  if (methods.__pre)
    reqs = methods.__pre(reqs);
  return reqs.reduce(function(promisesSoFar, req) {
    var p = null;
    if (!isValidRequest(req)) {
      p = Promise.resolve(makeResult(req, INVALID_REQUEST));
    } else {
      var method = methods[req.method];
      if (!method) {
        p = Promise.resolve(makeResult(req, METHOD_NOT_FOUND));
      } else {
        p = new Promise(function (resolve, reject) {
          try {
            var respond = function(response) {
              resolve(makeResult(req, response));
            }
            var ret = method.call(methods, req.params, respond, promisesSoFar.slice(0), nodeReq); //copy array to record current state in order to avoid deadlock
            if (typeof ret !== 'undefined') {
              if (typeof ret.then === 'function') //it's a promise
                resolve( ret.then(function(result) {return makeResult(req, result)}) );
              else
                respond(ret); //synchronous call
            }
          } catch (e) {
              console.log("unexpected error from jsonrpc method call:", req.method, "params:", req.params);
              console.log(e.stack);
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
function handleRequest(body, methods, req) {
  var isBatch = Array.isArray(body);
  return Promise.all(setup(body, methods, req)).then(
   function (result) {
     if (methods.__post)
       result = methods.__post(result);
     //filter out notification results (they won't have an id)
     result = result.filter(function(elem){return !!elem.id;});
     if (!result.length) {
       return null;
     }
     if (!isBatch && result.length == 1)
       return result[0];
     return result;
  });
}

/**
Express request handler.
usage: app.post('/', router.bind(methods))

@param {Object} [req] Express request object. Assumes req.body has already been parsed into json
@param {Object} [res] Express response object.
@param {Function} [next] Called if request isn't json
*/
module.exports.router = function(req, res, next) {
  if (req.headers['content-type'].indexOf( 'application/json' ) > -1) {
    handleRequest(req.body, this, req).then(function(result) {
      if (result) {
        var rpcResponse = (this.__stringify || JSON.stringify)(result);
        var contentLength = Buffer.byteLength(rpcResponse);
        res.writeHead(contentLength ? 200 : 204, {
          'Content-Length': String(contentLength),
          'Content-Type': req.headers['content-type']
        });
        res.end(rpcResponse);
      } else {
        res.end();
      }
    }).done();
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
