var utils = require('../lib/utils');
var _ = require('underscore');
var Promise = require('promise');
var mongoose = require('mongoose');
var mongodb = require('mongodb');

exports.models = models = {};
exports.schemas = schemas = {};

[
//require('./item'),
//require('./post'),
//require('./comment'),
require('./user'),
require('./file'),
].forEach(_.partial(utils.exportModel, module.exports));

function _extractTypeFromId(id) {
  if (id instanceof mongodb.DBRef)
    return id.namespace;
  var index = id.indexOf('@', 1);
  if (index > -1) {
    var start = id.charAt(0) == '@' ? 1 : 0;
    return id.slice(start, index);
  } else {
    return null;
  }
}

/*
* returns promise
*/
exports.findById = function(id){
  if (!id)
    return Promise.resolve(null);
  try {
    var type = _extractTypeFromId(id);
  } catch (err) {}
  if (!type)
    return Promise.reject(new mongoose.Error('bad id: ' + id));
  var model = mongoose.models[type];
  if (!model) {
    model = exports.models[type];
    if (!model)
      return Promise.reject(new mongoose.Error('missing model: ' + type));
    model = mongoose.models[type];
  }
  return model.findOne({_id:id}).exec();
}
