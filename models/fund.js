// app/models/fund.js

// load the things we need
var mongoose    = require('mongoose');
var createModel = require('../lib/createmodel');

// Recipient is an organization, or ultimate depository of funds.
// HAS_MANY Campaigns.
var fundSchema = mongoose.Schema({

    name         : String,
    recipient    : String
    // account? eventually ?
});


// create the model for users and expose it to our app
module.exports              = createModel('Fund', fundSchema);
module.exports.DEFAULT_ID   = '@Fund@0';
