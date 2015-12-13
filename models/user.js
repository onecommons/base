// app/models/user.js
// load the things we need
var mongoose = require('mongoose');
var bcrypt   = require('bcrypt-nodejs');
var createSchema = require('../lib/createmodel').createSchema;
var accountSchema = require("./account");
var validator = require('validator');

// define the schema for our user model
var userSchema = mongoose.Schema({

    displayName       : String,
    avatarUrl         : String,
    local            : {
        email        : {  type:String, lowercase: true, unique: true, sparse: true,
                          ui: {
                            createonly: true,
                            inputtype: 'email'
                          },
                          validate: [ validator.isEmail, 'invalid email' ]
        },
        password     : String,
        verified     : {type: Boolean, default:false},
        accountLocked: {type: Boolean, default:false},
        accountLockedUntil: Date,
        failedLoginAttempts: {type:Number, default:0},
        signupToken        : String,
        resetToken         : String,
        resetTokenExpires  : Date
     },
    facebook         : {
        id           : {type:String, unique: true, sparse: true },
        token        : String,
        email        : {type:String, lowercase: true},
        name         : String
    },
    twitter          : {
        id           : {type:String, unique: true, sparse: true },
        token        : String,
        displayName  : String,
        username     : String
    },
    google           : {
        id           : {type:String, unique: true, sparse: true },
        token        : String,
        email        : {type:String, lowercase: true},
        name         : String
    }

});

// methods ======================
// generating a hash
userSchema.statics.generateHash = function(password) {
    return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null);
};

// checking if password is valid
userSchema.methods.validPassword = function(password) {
    return bcrypt.compareSync(password, this.local.password);
};

/*
Implement disabling accounts by changing dynamically changing the type.
This approach enables any User query to exclude disabled users by default
while at same time preventing new accounts from re-using unique login identifiers
*/
userSchema.methods.disable = function() {
  //change type from User to DisabledAccount
  return module.exports.getModel().update({_id: this.id},
    {$set: { __t: 'DisabledAccount',
             disabledOn: new Date()
    }}).exec();
};

// create the model for users and expose it to our app
module.exports = createSchema('User', userSchema, accountSchema, {
    'write:displayName|write:avatarUrl':
      {'': 'admin',
       'id': 'user'
      }
});
