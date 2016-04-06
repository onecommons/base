var utils = require('../lib/utils');
var _ = require('underscore');
var Promise = require('promise');
var mongoose = require('mongoose');
var mongodb = require('mongodb');

var models = {};
exports.models = models;
var schemas = {};
exports.schemas = schemas;

[
//require('./item'),
//require('./post'),
//require('./comment'),
require("./account"),
require('./disabledaccount'),
require('./user'),
require('./file'),
require('./deleted'),
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

exports.getModelFromId = function(id){
  if (!id)
    return null;
  try {
    var type = _extractTypeFromId(id);
  } catch (err) {}
  if (!type)
    throw new mongoose.Error('bad id: ' + id);
  var model = mongoose.models[type];
  if (!model) {
    model = exports.models[type];
    if (!model)
      throw new mongoose.Error('missing model: ' + type);
  }
  return model;
};

/*
* returns promise
*/
exports.findById = function(id) {
  try {
    var model = exports.getModelFromId(id);
  } catch (err) {
    return Promise.reject(err);
  }
  if (!model)
    return Promise.reject(new mongoose.Error('missing model: ' + type));
  return model.findById(id).exec();
};
