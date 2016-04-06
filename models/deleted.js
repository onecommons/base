var createSchema = require('../lib/createmodel').createSchema;
module.exports = createSchema("Deleted", {
  by: {type: String, ref: "User"},
  object: {},
  reason: String
});
