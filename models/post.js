// post.js

var mongoose = require('mongoose');
var createModel = require('../lib/createmodel');
var Item = require('./item');

module.exports = createModel('Post',{ 'tags': { type : Array , "default" : [] }}, Item);


