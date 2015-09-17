// app/models/item.js

var mongoose = require('mongoose');
var createSchema = require('../lib/createmodel').createSchema;

// define the schema for our item model
var ItemSchema = mongoose.Schema({
    creator : {type: String, ref: "User"},
    creationDate : { type: Date, default: Date.now},
    modDate : {type: Date, default: Date.now},
    parent: {type: String, ref: "Item"},
    title: String,
    contents: String,
    /*
    nested: {
       nested1a: {
         p1: { more1: String, more2: String},
         p2: String
       },
       nested1b: {
         p1: String,
         p2: String
       },
       nested1c: {
         p1: String,
         p2: String
       }
    }*/
});

module.exports = createSchema('Item', ItemSchema);
