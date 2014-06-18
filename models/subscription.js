// app/models/subscription.js
// load the things we need
var mongoose = require('mongoose');
var bcrypt   = require('bcrypt-nodejs');
var createModel = require('../lib/createmodel');

// define the schema for our user model
// LINKS User > –- < Campaign
var subscriptionSchema = mongoose.Schema({

    frequency  : { type: String, enum: ['once','monthly','quarterly','yearly'], default: 'once'},
    lastCharge : { type: String, ref: 'FinancialTransaction'},
    amount     : { type: Number, max: 1500000, min: 100},
    user       : { type: String, ref: 'User'},
    campaign   : { type: String, ref: 'Campaign'}
});

// create the model for users and expose it to our app
module.exports = createModel('Subscription', subscriptionSchema);
