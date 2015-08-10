var createSchema = require('../lib/createmodel').createSchema;
var accountSchema = require("./account");
module.exports = createSchema("DisabledAccount", {
  disabledOn: Date
}, accountSchema);
