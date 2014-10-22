// app/models/user.js
// load the things we need
var mongoose = require('mongoose');
var bcrypt   = require('bcrypt-nodejs');
var createSchema = require('../lib/createmodel').createSchema;

// define the schema for our user model
var userSchema = mongoose.Schema({

    displayName       : String,
    avatarUrl         : String,
    local            : {
        email        : String,
        password     : String,
        verified     : {type: Boolean, default:false},
        accountLocked: {type: Boolean, default:false},
        accountLockedUntil: Date,
        failedLoginAttempts: {type:Number, default:0},
        signupToken        : String,
        signupTokenExpires : Date,
        resetToken         : String,
        resetTokenExpires  : Date
     },
    facebook         : {
        id           : String,
        token        : String,
        email        : String,
        name         : String
    },
    twitter          : {
        id           : String,
        token        : String,
        displayName  : String,
        username     : String
    },
    google           : {
        id           : String,
        token        : String,
        email        : String,
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


userSchema.methods.setupPaymentPlan = function(params){
    // edit paymentPlan fields from given params.

}

userSchema.methods.doPaymentPlanDebit = function(){
    // setup new FT record.
    // ft.doBPDebit()
    // save updated FT.
    // update reference to FT in user.payplan.lastCharge.
}


// create the model for users and expose it to our app
module.exports = createSchema('User', userSchema, null, {
    'write:displayName|write:avatarUrl':
      {'': 'admin',
       'id': 'user'
      }
});
