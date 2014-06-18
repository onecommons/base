// profile.js routes for user's profile pages

//
// Transaction History
//

var testTransactions = [];

for(var j =0; j < 5; j++){
	testTransactions[j] = {
	       "status":"succeeded"
	      ,"id": j 
	      ,"user":"thisUser"
	      ,"transactionType":"paymentPlanDebit"
	      ,"date":"01/01/2014"
	      ,"amount": "100" + j
	      ,"source":"Credit Card: 555" + j
	}
}

module.exports.transactionHistory = function(req, res) {
  res.render('transaction-history.html', {
    user : req.user
    ,transactions : testTransactions

  });
}

module.exports.setupPaymentPlan = function(req, res) {
  res.render('setup-payment-plan.html', {
    user : req.user
  });
}

module.exports.editPaymentPlan = function(req, res) {
  res.render('edit-payment-plan.html', {
    user : req.user
    ,currentDonationAmount : "50"
    ,currentDonationFrequency : "yearly"
    ,fundingInstrument : "4444"
  });
}