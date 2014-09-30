//
// oc-balanced.js  – our own little interface to features of balanced payments that we are using.
//

var httpRequest     = require('request');

var apiKey = 'ak-test-eyoGATiAg6YE5thvhSiWIi7NE0zg0l0U'; // for now,  test key
var baseUrl = "https://api.balancedpayments.com";
var defaultStatementText = "One Commons";
var defaultDescription = "User subscription payment";
var minAmount = 100;  // $1
var maxAmount = 1500000; // bp max is $15,000


// for debitCard, params must include amount (in cents) and "appears_on_statement_as" fields;
//   optionally include 'description' field used in balanced payments dashboard.
//  callback args are err, returned-data in json.
var debitCard = function(card_token, params, cb) {
     params.appears_on_statement_as = params.appears_on_statement_as || defaultStatementText;
     params.description = params.description || defaultDescription;
     var reqSettings = {
          url:  baseUrl + card_token + '/debits',
          auth: { user: apiKey, pass: '', sendImmediately: true },
          json: params
      }
      httpRequest.post(reqSettings, function(err, res, body){
          cb(err, body);
      });
}

var refundDebit = function(debit_id, amount, description, cb){
  var reqSettings = {
    url: baseUrl + '/debits/' + debit_id + '/refunds',
          auth: { user: apiKey, pass: '', sendImmediately: true },
          json: {amount: amount, description: description }
      }
      httpRequest.post(reqSettings, function(err, res, body){
          cb(err, body);
      });
}


// get info about the supplied card token. JSON returned from transaction:
/*
{
  "cards": [
    {
      "cvv_match": "no",
      "links": {
        "customer": null
      },
      "name": "John Doe",
      "expiration_year": 2020,
      "avs_street_match": null,
      "is_verified": true,
      "created_at": "2014-05-08T20:23:00.491282Z",
      "cvv_result": "No Match",
      "brand": "MasterCard",
      "number": "xxxxxxxxxxxx0002",
      "updated_at": "2014-05-08T20:23:00.491285Z",
      "id": "CC4gZFGtiP9SeT071GfDd231",
      "expiration_month": 12,
      "cvv": "xxx",
      "meta": {},
      "href": "/cards/CC4gZFGtiP9SeT071GfDd231",
      "address": {
        "city": null,
        "line2": null,
        "line1": null,
        "state": null,
        "postal_code": null,
        "country_code": null
      },
      "fingerprint": "f8a87f59d78d2a7673f60537753716d6b4849b8dfdca212fc9864f62b380afa7",
      "avs_postal_match": null,
      "avs_result": null
    }
  ],
  "links": {
    "cards.card_holds": "/cards/{cards.id}/card_holds",
    "cards.customer": "/customers/{cards.customer}",
    "cards.disputes": "/cards/{cards.id}/disputes",
    "cards.debits": "/cards/{cards.id}/debits"
  }
}
*/

var checkCard = function(card_token, cb) {
     params.description = params.description || defaultDescription;
     var reqSettings = {
          url:  baseUrl + card_token,
          auth: { user: apiKey, pass: '', sendImmediately: true },
      }
      httpRequest.post(reqSettings, function(err, res, body){
          cb(err, body);
      });
}

var setApiKey = function(apiKeyIn){ apiKey = apiKeyIn; }

module.exports.debitCard   = debitCard;
module.exports.refundDebit = refundDebit;
module.exports.setApiKey   = setApiKey;
module.exports.minAmount   = minAmount;
module.exports.maxAmount   = maxAmount;
