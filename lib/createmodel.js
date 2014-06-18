
var mongoose = require("mongoose");
var util = require('util');

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
module.exports.createModel = createModel = function(modelName, schema, optionsOrbaseModel) {
  var baseModel = undefined, options = undefined;
  if (optionsOrbaseModel) {
    if (optionsOrbaseModel.model && optionsOrbaseModel.schema) //hacky duck-typing
      baseModel = optionsOrbaseModel;
    else 
      options = optionsOrbaseModel;
  }

  var requiredKeys = {
    _id: String
  };

  if (!baseModel) //don't add this if derived class since mongoose already will
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
  if (baseModel) {
    if (isSchemaInstance) {
      if (!(schema instanceof baseModel.schema.constructor)) {
        throw new Error(schema.constructor.name + " must inherit from " +  baseModel.schema.constructor.name);
      }
    } else { 
      //schema is just the definition
      //create a new schema class derived from the base class
      var schemaClass = function(){ 
        baseModel.schema.constructor.apply(this, arguments);
        //copy base schema
        var This = this;
        baseModel.schema.eachPath(function(key, val) {
          if (key != '__t')
            This.paths[key] = val; 
        });
      };
      util.inherits(schemaClass, baseModel.schema.constructor);
      //note: mongoose doesn't support different options in the derived class 
      //so copy base options to avoid "Discriminator options are not customizable" error
      schema = new schemaClass(schema, baseModel.schema.options); 
    }
    model = baseModel.discriminator(modelName, schema);
  } else {
    if (options) {
      schema = new mongoose.Schema(schema, options);
    }
    model = mongoose.model(modelName, schema);
    //don't do this if baseClass or else it will get called twice
    model.schema.pre('save', function(next){
       //console.log("IN SAVE HOOK", this._id, modelName, this.constructor.modelName);
       if(this.isNew && !this._id){
           this._id =  '@' + this.constructor.modelName + '@' + mongoose.Types.ObjectId().toString();
       }
       next();
   });
 }   

  model.willGenerateId = true;
  return model; 
};

module.exports = exports = createModel;

