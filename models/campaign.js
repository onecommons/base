// app/models/campaign.js
// load the things we need
var mongoose = require('mongoose');
var createSchema = require('../lib/createmodel').createSchema;

// define the schema for our campaign model.
//  HAS MANY Subscriptions.
var campaignSchema = mongoose.Schema({

   name              : String,
   fund              : {type: String, ref: 'Fund'}
});

// create the model for users and expose it to our app
module.exports              = createSchema('Campaign', campaignSchema);
module.exports.DEFAULT_ID   = '@Campaign@0';
