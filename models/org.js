// app/models/org.js
// load the things we need
var mongoose = require('mongoose');
var createModel = require('../lib/createmodel');

// define the schema for our user model
var orgSchema = mongoose.Schema({

    orgName           : String,
    homeLink          : String,
    wikiLink          : String,
    wikiText          : String,
    wikiThumbLink     : String,

    keywords          : [{
                          text       : String, 
                          relevance  : Number
                        }]

});


// create the model for users and expose it to our app
module.exports = createModel('Org', orgSchema);
