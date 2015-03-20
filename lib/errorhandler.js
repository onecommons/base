var http = require('http');

//derived from "errorhandler" package
function errorHandler(err, req, res, next){
  if (!req.suppressErrorHandlerConsole && !req.app.suppressErrorHandlerConsole) {
    if (req.log) {
      req.log.error(err, "Unhandled Error");
    } else {
      console.log("Unhandled error");
      console.log(err.stack || err);
    }
  }
  if (err.status) res.statusCode = err.status;
  if (res.statusCode < 400) res.statusCode = 500;
  if (res._header) return; //??
  var accept = req.headers.accept || '';
  var stack = req.app.get('env') != 'production' ? err.stack : '';
  // html
  if (~accept.indexOf('html')) {
    res.render('error.html', {
      message: http.STATUS_CODES[res.statusCode],
      statusCode: res.statusCode,
      error: err.toString(),
      errorstack: (stack || '').split('\n').slice(1)
    });
  // json
  } else if (~accept.indexOf('json')) {
    var error = { message: err.message, stack: stack };
    for (var prop in err) error[prop] = err[prop];
    res.json({ error: error });
  // plain text
  } else {
    res.setHeader('Content-Type', 'text/plain');
    res.end(stack);
  }
};

module.exports = errorHandler;
