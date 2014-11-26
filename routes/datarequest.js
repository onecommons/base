// datarequest.js  route
var datastore = require('../lib/datastore');
var jsonrpc   = require('../lib/jsonrpc');

var methods = new datastore.RequestHandler(new datastore.MongooseDatastore());
module.exports = jsonrpc.router.bind(methods);
module.exports.methods = methods;
