exports.models = models = {};
exports.schemas = schemas = {};

function exportModel(schema) {
 schemas[schema.metadata.modelName] = schema
 //lazily get models
 Object.defineProperty(models, schema.metadata.modelName, {
    get: function() { return schema.getModel();}
 });
 Object.defineProperty(module.exports, schema.metadata.modelName, {
   get: function() { return schema.getModel();}
 });
}

[
//require('./item'),
//require('./post'),
//require('./comment'),
require('./financial-transaction'),
require('./funding-instrument'),
require('./user'),
require('./subscription'),
require('./campaign'),
//require('./fund'),
].forEach(exportModel);
