var _ = require('underscore');
var mongodb = require('mongodb');
var DBRef = mongodb.DBRef, ObjectID = mongodb.ObjectID;
var mongoose = require('mongoose');
var models = require('../models'); //make sure all the models we need are loaded
var jsonrpc   = require('../lib/jsonrpc');
var access = require('../lib/access');

mongoose.Types.Array.prototype.extend = function (arr) {
  var ret = [].push.apply(this, arr);
  // $pushAll might be fibbed (could be $push). But it makes it easier to
  // handle what could have been $push, $pushAll combos
  this._registerAtomic('$pushAll', arr);
  this._markModified();
  return ret;
};

var pJSON = {
  //XXX escape keys with $ or . with U+FF04 and U+FF0E respectively? http://docs.mongodb.org/manual/faq/developers/#how-does-mongodb-address-sql-or-query-injection
  stringify: function(value, space) {
    /*
      ObjectIds are serialized as @@id
      DBRefs are serialized as @@collection@id or @@collection@@id, depending on whether id is an objectid
      string values starting @ @ are prepended with ::
    */
    return JSON.stringify(value, function(k,v) {
      if (v && typeof v === 'object') {
        //we have to do it like this to avoid toString being call internally
        var copy = new v.constructor();
        for (var prop in v) {
          if (!v.hasOwnProperty(prop)) continue;
          var val = v[prop]
          if (val instanceof ObjectID) {
              val = "@@" + val;
          } else if (val instanceof DBRef) {
            if (val.oid instanceof ObjectID)
              val = '@@' + val.namespace + '@@' + val.oid;
            else
              val = '@@' + val.namespace + '@' + val.oid;
          } else {
            if (typeof val == 'string' && (val.slice(0,2) == '@@')) {
             val = '::' + val;
            }
          }
          copy[prop] = val;
        }
        return copy;
      }
      return v;
    }, space);
  },
  parse: function(text) {
    return JSON.parse(text, this.reviver);
  },
  reviver: function(k,v){
      /*
      string values starting with @@ are converted to objectids
      string values that look like @@*@* or @@*@@* are converted to DbRefs with a user-defined string id or ObjectId respectively
      strip the leading :: from strings that start with ::@@
      */
      if (typeof v == 'string') {
        var prefix = v.slice(0,2);
        if (prefix =='@@') {
            var index = v.indexOf('@', 2); // /(?!::)@/
            if (index > -1) { //DBRef
              if (v.charAt(index+1) == '@')
                return new DBRef(v.slice(2, index), ObjectID(v.slice(index+2)));
              else
                return new DBRef(v.slice(2, index), v.slice(index+1));
            } else { //unescape to handle ids with @ in their name
              return ObjectID(v.slice(2));
            }
        } else if (prefix == '::' && v.slice(2,4) == '@@'){
          return v.slice(2);
        }
      }
    return v;
  }
}

function _getmjson(_mjson) {
  var mjson = (typeof _mjson == 'string')  ? pJSON.parse(_mjson) : _mjson;
  if (typeof mjson != 'object' || Array.isArray(mjson))
    throw new Error("invalid pjson object: " + _mjson);
  return mjson;
}

var MongoRawDatastore = function(collection) {
   this.collection = collection;
};

MongoRawDatastore.prototype = {
  defaultOptions: {w: 1}

  //add the specified keys
  //if the key exists error if its current value is not an array
  //key doesn't exist its added with the value as first entry in an array
  //if value is an array, the values are appended to current array XXX need override
  //error if not _id or _id doesn't exist
  ,add: function(mjson, cb) {
    mjson = _getmjson(mjson);

    var obj = {};
    /* XXX
    if (!mjson._id) {
       cb(err)
    } */
    for (var key in mjson) {
        if (!mjson.hasOwnProperty(key) || key == '_id') continue;
        var val = mjson[key];
        if (Array.isArray(val))
          obj[key] = {$each: val};
        else
          obj[key] = val;
    }
    this.collection.update({_id:mjson._id},{$addToSet: obj}, this.defaultOptions, cb);
  }

  //remove the specified values or keys
  //if the value is null, the key is removed
  //if the key has a value it is assumed the key is an array and only that value is being removed from the array
  //if value is an array each item is removed
  //if value or key doesn't exists ????????
  //error if not _id or _id doesn't exist
  ,remove: function(mjson, cb) {
    //$pull or $unset
    mjson = _getmjson(mjson);

    var unset = {}, pull = {}, pullAll = {};
    for (var key in mjson) {
        if (!mjson.hasOwnProperty(key)) continue;
        var val = mjson[key];
        if (val === null) {
          unset[key] = '';
        }
        if (Array.isArray(val))
          pullAll[key] = val;
        else
          pull[key] = val;
    }
    var updateObj = {
      $unset: unset,
      $pull: pull,
      $pullAll: pullAll
    };
    this.collection.update({_id:_id}, updateObj,this.defaultOptions,cb);
  }

  /*
  replaces the current object
  if _id doesn't exist, error //creates new object
  error if no _id
  */
  ,replace: function(mjson, cb) {
    mjson = _getmjson(mjson);
    this.collection.save(mjson, this.defaultOptions, cb);
  }

  ,_update:  function(mjson) {
    if (typeof mjson != 'object' || Array.isArray(mjson))
        throw new Error("invalid pjson object");
      mjson = _.omit(mjson); //copy mjson so we don't mutate original arg
      var options = this.defaultOptions; //misc.merge({upsert:true}, this.defaultOptions);
      var _id = mjson['_id'];
      delete mjson['_id'];
      this.collection.update({_id:_id}, {$set: mjson}, options, cb);
  }

  /*
  replaces specified fields
  if _id doesn't exist, error //creates new object
  error if no _id
  */
  ,update: function(mjson, cb) {
    if (typeof mjson == 'string')
      mjson = pJSON.parse(mjson);

    if (Array.isArray(mjson))
      mjson.each(_update.bind(this));
    else
      this._update(mjson);
  }

  /*
  creates a new obj, returns new id
  error if id is specified and already exists
  */
  ,create: function(mjson, cb) {
    mjson = _getmjson(mjson);
    //create the given object, error if _id exists
    this.collection.insert(mjson, this.defaultOptions, cb);
  }
  ,query: function(mjson, cb) {
    //XXX implement, santize
    mjson = _getmjson(mjson);
    //json.criteria, json.projection
    this.collection.find().toArray(cb);
  }

  //XXX , destroy: function() //delete the object
};

function _extractTypeFromId(id) {
  if (id instanceof DBRef)
    return id.namespace;
  var index = id.indexOf('@', 1);
  if (index > -1) {
    var start = id.charAt(0) == '@' ? 1 : 0;
    return id.slice(start, index);
  } else {
    return null;
  }
}

function _getmjson2(_mjson) {
  var mjson = (typeof _mjson == 'string')  ? pJSON.parse(_mjson) : _mjson;
  var options = null;
  if (Array.isArray(mjson)) {
    options = mjson[1];
    mjson = mjson[0];
  }
  if (typeof mjson != 'object' || Array.isArray(mjson))
    throw new Error("invalid pjson object: " + _mjson);
  return [mjson, options];
}

function getModels() {
  var models = {};
  _.each(mongoose.models, function(value, key) {
    if (models[key]) {
      if (models[key] !== value)
        throw new Error("Model with name \"" + key + "\" already exists");
    } else {
      models[key] = value;
    }
    if (value.discriminators) {
      _.each(value.discriminators, function(value, key) {
        if (models[key]) {
          if (models[key] !== value)
            throw new Error("Model with name \"" + key + "\" already exists");
        } else {
          models[key] = value;
        }
      });
    }
  });
  //console.log("getmodels", Object.keys(models));
  return models;
}

var MongooseDatastore = function() {
  this.models = getModels();
};

/*
XXX need to support nested objects
e.g.
update
 foo: {
   bar: 1
 }
does it replace foo entirely or just bar?
*/
MongooseDatastore.prototype = {

  _getModel: function(type, cb) {
    var model = this.models[type];
    if (!model) {
      this.models = getModels(); //refresh
    }
    model = this.models[type];
    if (!model && cb) {
      cb(new mongoose.Error.MissingSchemaError(type));
    }
    return model;
  }

  /*
  creates a new obj, returns new id
  error if id is specified and already exists
  */
  , create: function(mjson_, cb, principle) {
      var jo = _getmjson2(mjson_);
      var mjson = jo[0], options = jo[1];
      var type = mjson.__t;
      if (mjson._id) {
        if (!type) {
          type = _extractTypeFromId(mjson._id);
        } else if (type != _extractTypeFromId(mjson._id)) {
          cb(new mongoose.Error("type mismatch with _id: " + mjson._id));
          return;
        }
      }

      var model = this._getModel(type, cb);
      if (!model)
        return;

      if (!mjson._id && !model.willGenerateId) { //generate an id
        mjson._id = '@' + type + "@@" + ObjectID(null).toHexString();
      }

      var doc = new model();
      if (principle) {
        if (!doc.setPrinciple) {
          cb(new mongoose.Error("access control not enabled on "
            + (mjson._id ||"new " + type)));
        }
        doc.setPrinciple(principle);
      }
      try {
        doc.set(mjson);
      } catch (err) {
        cb(err);
        return;
      }
      doc.save(cb);
   }

  , _getModelFromMjson: function(mjson, cb) {
    if (!mjson._id) {
      cb(new mongoose.Error("missing _id"));
      return;
    }
    var type = _extractTypeFromId(mjson._id);
    if (!type) {
      cb(new mongoose.Error("bad _id: " + mjson._id));
      return;
    }
    return this._getModel(type, cb);
  }

  ,_update: function(mjson_, cb, dostuff, principle) {
    var jo = _getmjson2(mjson_);
    var mjson = jo[0], options = jo[1];;
    var model = this._getModelFromMjson(mjson, cb);
    if (!model)
      return;
    //load obj so that validation, authorization, etc. is applied
    var query = model.findOne({ _id: mjson._id});
    if (options && options.populate) {
      if (Array.isArray(options.populate))
        query = query.populate.apply(query, options.populate);
      else
        query = query.populate(options.populate);
    }
    query.exec(function (err, obj) {
      if (err) {
        cb(err);
        return
      }
      if (!obj) {
        cb(new mongoose.Error("id not found: " + mjson._id));
        return
      }
      if (principle) {
        if (!obj.setPrinciple) {
          cb(new mongoose.Error("access control not enabled on " + mjson._id));
        }
        obj.setPrinciple(principle);
      }
      try {
        if (dostuff(mjson, obj))
          obj.save(cb);
      } catch (err) {
        cb(err);
      }
    });
  }

  //add the specified keys
  //key doesn't exist its added with the given value
  //if key exists, current value is converted to array if necessary and the given values are appended to current array
  //error if not _id or _id doesn't exist
  ,add: function(mjson, cb, principle) {
    this._update(mjson, cb, function(mjson, obj) {
      for (var key in mjson) {
        if (!mjson.hasOwnProperty(key) || key == '_id') continue;
        var val = mjson[key];
        var valIsArray = Array.isArray(val);
        var currentVal = obj._doc[key];
        //XXX should have set not bag semantics
        if (currentVal === undefined) {
          obj.set(key, val);
        } else if (!Array.isArray(currentVal))  {
          if (valIsArray) {
            obj.set(key, [currentVal].concat(val) );
          } else {
            obj.set(key, [currentVal, val]);
          }
        } else {
          obj._doc[key].extend( valIsArray ? val: [val] );
        }
      }
      return true;
    }, principle);
  }

  //remove the specified values or keys
  //if the value is null, the key is removed
  //if the key has a value it is assumed the key is an array and only that value is being removed from the array
  //if value is an array each item is removed
  //error if key doesn't exists
  //error if not _id or _id doesn't exist
  ,remove: function(mjson, cb, principle) {
    this._update(mjson, cb, function(mjson, obj) {
      for (var key in mjson) {
        if (!mjson.hasOwnProperty(key) || key == '_id') continue;
        var val = mjson[key];
        if (val === null) {
          obj.set(key, undefined);
        } else {
          var marray = obj._doc[key]; //XXX is there a cleaner approach than using _doc?
          if (!Array.isArray(marray)) {
            cb(new mongoose.Error.CastError(key + " is not an array"));
            return false; //XXX unit test
          }
          if (Array.isArray(val)) {
            marray.pull.apply(marray, val);
          } else {
            marray.pull(val);
          }
        }
      }
      return true;
    }, principle);
  }

  /*
  replaces specified fields
  if _id doesn't exist, error
  error if no _id
  */
  ,update: function(mjson, cb, principle) {
     this._update(mjson, cb, function(mjson, obj) {
      for (var key in mjson) {
        if (!mjson.hasOwnProperty(key) || key == '_id') continue;
        obj.set(key, mjson[key]);
      }
      return true;
    }, principle);
  }

  ,destroy: function(_mjson, cb, principle) {//delete the object
      var mjson =  (typeof _mjson == 'string' && _mjson.charAt(0) != '@')
                    ? pJSON.parse(_mjson) : _mjson;
      var _id = (mjson && mjson._id) || mjson;
      if (typeof _id != 'string') {
        cb(new mongoose.Error("invalid _id: " + _id));
        return;
      }
      var type = _extractTypeFromId(_id);
      if (!type) {
        cb(new mongoose.Error("bad _id: " + _id));
        return;
      }
      var model = this._getModel(type, cb);
      if (model) {
        if (principle) { //need to load the object so we can do the access check
          model.findOne({ _id: _id}, function (err, obj) {
            if (err) {
              cb(err);
              return
            }
            if (!obj) {
              cb(new mongoose.Error("id not found: " + _id));
              return
            }
            if (!obj.setPrinciple) {
              cb(new mongoose.Error("access control not enabled on " + _id));
              return
            }
            obj.setPrinciple(principle);
            if (!obj.check('remove')) {
              cb(new access.AccessDeniedError('remove for ' + _id));
              return;
            }
            (new model({_id:_id})).remove(cb);
          });
        } else {
          (new model({_id:_id})).remove(cb);
        }
    }
  }

  /*
  replaces the current object
  if _id doesn't exist, error
  error if no _id
  */
  ,replace: function(mjson, cb, principle) {
    this._update(mjson, cb, function(mjson, obj) {
      var doc = obj._doc;
      for (var existing in doc) {
        if (!doc.hasOwnProperty(existing)) continue;
        if (existing == '_id' || existing.substring(0,2) == '__')
          continue;
        if (mjson[existing] === undefined) {
          obj.set(existing, undefined);//delete key
        }
      }
      for (var key in mjson) {
        if (!mjson.hasOwnProperty(key) || key == '_id')
          continue;
        obj.set(key, mjson[key]);
      }
      return true;
    }, principle);
  }

  ,query: function(mjson, cb, principle) {
    mjson = _getmjson(mjson);
    var query = mjson.conditions;
    if (!query) {
      cb(new mongoose.Error("bad query (missing conditions): " + JSON.stringify(mjson)));
      return;
    }
    var type = query.__t;
    if (query._id) {
      if (!type) {
        type = _extractTypeFromId(query._id);
      } else if (type != _extractTypeFromId(query._id)) {
        cb(new mongoose.Error("type mismatch with _id: " + query._id));
        return;
      }
    }
    if (!type) {
      cb(new mongoose.Error("no type specified in query: " + JSON.stringify(query)));
      return;
    }
    var model = this._getModel(type, cb);
    if (!model)
      return;
    if (principle) {
      if (!model.check) {
        cb(new mongoose.Error("access control not enabled on " + model.modelName));
        return
      }
    }
    //json.criteria, json.projection
    model.find(query, function(err, results) {
      if (err) {
        cb(err);
      } else {
        if (principle) {
          try {
            results.forEach(function(doc) {
              doc.setPrinciple(principle);
              doc.ensure('view');
            });
          } catch (err) {
            cb(err);
            return;
          }
        }
        cb(err, results)
      }
    });
  }
};


var RequestHandler = function(datastore) {
   this.datastore = datastore;
};

RequestHandler.prototype = {};

RequestHandler.prototype._getJsonrpcResponse = function(err, doc, op) {
    if (err) {
      //console.log("datastore error", err);
      return new jsonrpc.JsonRpcError(-32001, "Data Error", err);
    } else {
      return doc;
    }
}

RequestHandler.prototype.add = function(mjson, respond, p, session) {
    var This = this;
    this.datastore.add(mjson, function(err, doc){
      //doc is array of records inserted
      respond(This._getJsonrpcResponse(err, doc));
    }, session.httpRequest.user);
}

RequestHandler.prototype.remove = function(mjson, respond, p, session) {
    var This = this;
    this.datastore.remove(mjson, function(err, doc){
      //doc is number of records inserted
      respond(This._getJsonrpcResponse(err, doc));
    }, session.httpRequest.user);
}

RequestHandler.prototype.destroy = function(mjson, respond, p, session) {
    var This = this;
    this.datastore.destroy(mjson, function(err, doc){
      //doc is number of records inserted
      respond(This._getJsonrpcResponse(err, doc));
    }, session.httpRequest.user);
}

RequestHandler.prototype.replace = function(mjson, respond, p, session) {
    var This = this;
    this.datastore.replace(mjson, function(err, doc){
      //doc is number of records inserted
      respond(This._getJsonrpcResponse(err, doc));
    }, session.httpRequest.user);
}

RequestHandler.prototype.update = function(mjson, respond, p, session) {
    var This = this;
    this.datastore.update(mjson, function(err, doc){
      //doc is number of records inserted
      respond(This._getJsonrpcResponse(err, doc));
    }, session.httpRequest.user);
}

RequestHandler.prototype.create = function(mjson, respond, p, session) {
    var This = this;
    this.datastore.create(mjson, function(err, doc){
      //doc is array of records inserted
      respond(This._getJsonrpcResponse(err, doc));
    }, session.httpRequest.user);
}

RequestHandler.prototype.query = function(mjson, respond, p, session) {
    var This = this;
    this.datastore.query(mjson, function(err, doc){
      respond(This._getJsonrpcResponse(err, doc));
    }, session.httpRequest.user);
}

RequestHandler.prototype.transaction_info = function(json, respond) {
    var This = this, doc = {};
    //XXX
    //if (json.comment)
    //  document.comment = Template(comment).safe_substitute(newresourcesCreated);
    respond(This._getJsonrpcResponse(null, doc));
}

RequestHandler.prototype.__stringify = pJSON.stringify;

exports.pJSON = pJSON;
exports.MongoRawDatastore = MongoRawDatastore;
exports.MongooseDatastore = MongooseDatastore;
exports.RequestHandler = RequestHandler;
