// app/models/user.js
// load the things we need
var mongoose = require('mongoose');
var bcrypt   = require('bcrypt-nodejs');
var createModel = require('../lib/createmodel');

// define the schema for our user model
var userSchema = mongoose.Schema({

    displayName       : String,
    avatarUrl         : String,
    activeFI          : {type: String, ref: 'FundingInstrument'},

    paymentPlan           : {
                          frequency  : { type: String, enum: ['once','monthly','quarterly','yearly']},
                          lastCharge : { type: String, ref: 'FinancialTransaction'},
                          fi         : { type: String, ref: 'FundingInstrument'},
                          amount     : { type: Number, max: 1500000, min: 100}
                         },

    local            : {
        email        : String,
        password     : String,
        verified     : {type: Boolean, default:false},
        accountLocked: {type: Boolean, default:false},
        accountLockedUntil: Date,
        failedLoginAttempts: {type:Number, default:0},
        signupToken        : String,
        signupTokenExpires : Date
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
userSchema.methods.generateHash = function(password) {
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
module.exports = createModel('User', userSchema);
