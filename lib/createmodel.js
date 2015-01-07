
var mongoose = require("mongoose");
var util = require('util');
var access = require('../lib/access');
var _ = require('underscore');
var Promise = require('promise');

function intersects(a, b) {
  for (var i = 0; i < a.length; i++) {
    if (b.indexOf(a[i]) != -1)
      return true;
  }
  return false;
}

var policy = new access.Policy({
  'any': undefined,
  'read': 'any',
  'write': 'any',
  'edit':'write',
  'create':'write',
  'remove': 'write',
  'view': 'read',
});

policy.defaultaccesscontrol = {'any': 'admin'};

policy.roleToPermissions = {
  user: ['user'],
  admin: ['user', 'admin']
}

policy.hasPermission = function(user, object, rel, guards) {
  function getRoles(user) {
    return user.roles || [];
  }

  //if (relation == 'group')
  //only get the rights for the groups the user shares with the object
  //  return _.chain(object.groups).map( (g) => findmembership(user, g).rights).flatten().uniq()

  var self = this;
  var userguards = _.chain(getRoles(user)).map(function(v) {
    return self.roleToPermissions[v]||''
  }).flatten().uniq().value();
  return intersects(guards, userguards);
};

var _currentPolicy = policy;
function getAccessControlPolicy() {
  return _currentPolicy;
}
function setAccessControlPolicy(p) {
  _currentPolicy = p;
}

function guardSchemaPlugin(schema, options) {
  var accesscontrol = options.map;
  if (!options.base) {
    //we have to do the check as properties are set because rules can depend
    //on the values of the properties so we need to check with the original value
    schema.pre('markModified', function (next, key) {
      var user = this.getPrinciple();
      if (user) {
        var op = this.isNew ? 'create' : 'edit';
        if (!(key == '_id' && this.isNew)) {
          this.ensure(op, key.split('.')[0]); //XXX handle nested properties
        }
      }
      next();
    });
    schema.pre('save', function (next) {
      var user = this.getPrinciple();
      if (user) {
        try {
           //if we haven't already done a check, do one now
           var paths = this.modifiedPaths();
           var count = 0;
           if (this.isNew && paths.indexOf('_id') > -1)
             count++; //ignore _id
           if (paths.length <= count) {//there were no paths that were checked
             var op = this.isNew ? 'create' : 'edit';
             this.schema.statics.ensure(user, op); //need the most derived schema
           }
        } catch (err) {
           next(err);
        }
      }
      next();
    });
  }
  schema._accessControlMaps = [accesscontrol];
  schema.updateAccessControlMap = function(map) {
    schema._accessControlMaps.unshift(map);//insert at front
  }
  schema.getChecker = function() {
    //need to create this lazily to wait for access control policy to be set
    if (!schema._checker) {
      var policy = options.policy || getAccessControlPolicy();
      var accesscontrolList = options.base ?
          schema._accessControlMaps.concat(options.base.getChecker().accessControlMap)
         : schema._accessControlMaps.concat(options.defaultmap || policy.defaultaccesscontrol);
      schema._checker = access.createOperationChecker(accesscontrolList, policy);
    }
    return schema._checker;
  };
  schema.methods.setPrinciple = function(p) {
    this._principle = p
  };
  schema.methods.getPrinciple = function() {
    return this._principle;
  };
  schema.methods.findAccessRules = function(op, prop) {
    var rules = [];
    if (prop)
      rules = this.schema.getChecker().getRules(op+':'+prop)
    rules = rules.concat( this.schema.getChecker().getRules(op) );
    return rules;
  };
  schema.methods.check = function(op, prop) {
    var rules = this.findAccessRules(op, prop);
    return access.check(this.getPrinciple(), this, rules);
  };
  schema.methods.ensure = function(op, prop) {
    var rules = this.findAccessRules(op, prop);
    return access.ensure(this.getPrinciple(), this, rules);
  };
  schema.statics.check = function(principle, op) {
    return access.check(principle, {}, schema.getChecker().getRules(op));
  };
  schema.statics.ensure = function(principle, op) {
    return access.ensure(principle, {}, schema.getChecker().getRules(op));
  };
}

/*
 * @param {String} name model name
 * @param {Schema} [schema] (plain object or Schema object)
 * @param {Object} [options] schema options (optional, only use if schema is plain object)
 * @param {Model} [baseModel] base model to inherit from (optional)
 *
 * options and baseModel are mutually exclusive
 *
 * @api public
 */
var createSchema = function(modelName, schema, optionsOrbaseModel, accesscontrol) {
  var baseSchema = undefined, options = undefined;
  if (optionsOrbaseModel) {
    if (optionsOrbaseModel instanceof mongoose.Schema)
      baseSchema = optionsOrbaseModel;
    else if (optionsOrbaseModel.model && optionsOrbaseModel.schema) //hacky duck-typing
      baseSchema = optionsOrbaseModel.schema;
    else
      options = optionsOrbaseModel;
  }
  accesscontrol = accesscontrol || {};

  var requiredKeys = {
    _id: String
  };

  if (!baseSchema) //don't add this if derived class since mongoose already will
    requiredKeys['__t'] = {type: String, default: modelName}

  var isSchemaInstance = schema instanceof mongoose.Schema;
  if (options && isSchemaInstance)
    throw new Error("can't use options with a Schema object");
  for (var key in requiredKeys) {
    if (!requiredKeys.hasOwnProperty(key))
      continue;
    var val = requiredKeys[key];
    if (isSchemaInstance) {
      schema.path(key, val);
    } else { //plain object
      schema[key] = val;
    }
  }

  var model;
  if (baseSchema) {
    if (isSchemaInstance) {
      if (!(schema instanceof baseSchema.constructor)) {
        throw new Error(schema.constructor.name + " must inherit from " +  baseSchema.constructor.name);
      }
    } else {
      //schema is just the definition
      //create a new schema class derived from the base class
      var schemaClass = function(){
        baseSchema.constructor.apply(this, arguments);
        //copy base schema
        var This = this;
        baseSchema.eachPath(function(key, val) {
          if (key != '__t')
            This.paths[key] = val;
        });
      };
      util.inherits(schemaClass, baseSchema.constructor);
      //note: mongoose doesn't support different options in the derived class
      //so copy base options to avoid "Discriminator options are not customizable" error
      schema = new schemaClass(schema, baseSchema.options);
    }
    if (!accesscontrol.disable) {
      schema.plugin(guardSchemaPlugin, {map:accesscontrol, base:baseSchema});
    }
    //model = baseModel.discriminator(modelName, schema);
  } else {
    //XXX document: set collection option if not set
    if (!isSchemaInstance) {
      options = options || {};
      if (!options.collection) {
        options.collection = modelName;
      }
      schema = new mongoose.Schema(schema, options);
    } else {
      if (!schema.set('collection'))
        schema.set('collection', modelName);
    }
    //don't do this if baseClass or else it will get called twice
    schema.pre('save', function(next){
       //console.log("save hook", this._id, modelName, this.constructor.modelName);
       if(this.isNew && !this._id){
           this._id = this.constructor.generateId();
       }
       next();
    });
    schema.statics.generateId = function(val) {
      return '@' + this.modelName + '@' +
        (typeof val === 'undefined'? mongoose.Types.ObjectId().toString() : val);
    }
    schema.methods.saveP = function() { return Promise.denodeify(this.save).call(this); }
    if (!accesscontrol.disable) {
      //needs to be called before creating the model (for methods and statics)
      //but after the above save hook
      schema.plugin(guardSchemaPlugin, {map:accesscontrol});
    }
    schema.virtual('createdOn').get(function() {
      if (!this.id)
        return null;
      var match = this.id.match(/^@.+@([0-9a-f]{24})$/);
      if (!match)
        return null;
      return mongoose.Types.ObjectId(match[1]).getTimestamp();
    });
    //model = mongoose.model(modelName, schema);
 }
 schema.metadata = {
    modelName: modelName,
    accesscontrol: accesscontrol,
    base: baseSchema
 };
 schema.getModel = getModel;
 schema.statics.willGenerateId = true;
 if (schema[modelName]) { throw new Error("model name conflicts with schema property"); }
 Object.defineProperty(schema, modelName, { get: function () { return this.getModel(); } });
 return schema;
};

function getModel() {
  if (!this._model) {
    if (this.metadata.base) {
      var baseModel = this.metadata.base.getModel();
      this._model = baseModel.discriminator(this.metadata.modelName, this);
    } else {
      this._model = mongoose.model(this.metadata.modelName, this);
    }
  }
  return this._model;
}

var createModel = function() {
  return createSchema.apply(this, arguments).getModel();
}

createModel.getAccessControlPolicy = getAccessControlPolicy;
createModel.setAccessControlPolicy = setAccessControlPolicy;
createModel.guardSchemaPlugin = guardSchemaPlugin;
createModel.createSchema = createSchema;
module.exports = exports = createModel;
