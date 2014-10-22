var exportModel = require('../lib/utils').exportModel;
var _ = require('underscore');

exports.models = models = {};
exports.schemas = schemas = {};

[
//require('./item'),
//require('./post'),
//require('./comment'),
require('./user'),
].forEach(_.partial(exportModel, module.exports));
