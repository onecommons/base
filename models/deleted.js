var createSchema = require('../lib/createmodel').createSchema;
module.exports = createSchema("Deleted", {
  by: {type: String, ref: "User"},
  deletedId: {type: String, unique: true},
  object: {},
  reason: String
});
