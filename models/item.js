// app/models/item.js

var mongoose = require('mongoose');
var createModel = require('../lib/createmodel');

// define the schema for our item model
var ItemSchema = mongoose.Schema({
    creator : {type: String, ref: "User"},
    creationDate : { type: Date, default: Date.now}, 
    modDate : {type: Date, default: Date.now},
    parent: {type: String, ref: "Item"},
    title: String,
    contents: String
});

// expose model and schema to our app.

// var Item = mongoose.model('Item', ItemSchema);


var Item  = createModel('Item', {
    creator : {type: String, ref: "User"},
    creationDate : { type: Date, default: Date.now}, 
    modDate : {type: Date, default: Date.now},
    parent: { type: String, ref: 'Item'},
    title: String,
    content: String
});


module.exports = Item;
