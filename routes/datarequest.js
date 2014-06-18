// datarequest.js  route
var datastore = require('../lib/datastore');
var jsonrpc   = require('../lib/jsonrpc');

module.exports = jsonrpc.router.bind(
  new datastore.RequestHandler(new datastore.MongooseDatastore())
);
