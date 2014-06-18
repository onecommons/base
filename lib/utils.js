// misc utilities  trp  jan 2012
//

// flat merge, 2nd object properties overwrite first.
var merge = function(obj1, obj2){
        for (var property in obj2){
            if(obj2.hasOwnProperty(property)){
                obj1[property] = obj2[property];
            }
        }
        return obj1;
};

exports.merge = merge;

   // like the python dictionary pop.
   // return obj[prop] and remove property from obj.
   // if obj[prop] doesn't exist, return default value.
exports.pyPop = function (obj, prop, defaultValue){
   obj = (obj === undefined) ? {} : obj;

   if(obj.hasOwnProperty(prop)){
       var rv =  obj[prop];
       delete obj[prop];
       return rv;
   } else {
       return defaultValue;
   }
}

// useful type determination: Function, Object, string, number, Array, null, undefined, RegExp.
exports.trueTypeof = function(value) {
    if (value === null) {
        return "null";
    }
    var t = typeof value;
    switch(t) {
        case "function":
        case "object":
            if (value.constructor) {
                if (value.constructor.name) {
                    return value.constructor.name;
                } else {
                    // Internet Explorer
                    // Anonymous functions are stringified as follows: 'function () {}'
                    // => the regex below does not match
                    var match = value.constructor.toString().match(/^function (.+)\(.*$/);
                    if (match) {
                        return match[1];
                    }
                }
            }
            // fallback, for nameless constructors etc.
            return Object.prototype.toString.call(value).match(/^\[object (.+)\]$/)[1];
        default:
            return t;
    }
};

getTimeLeft = function(target_date) {
  var difference = target_date - new Date();

  // basic math variables
  var _second = 1000,
    _minute = _second * 60,
    _hour = _minute * 60,
    _day = _hour * 24;

  // calculate dates
  var days = Math.floor(difference / _day),
    hours = Math.floor((difference % _day) / _hour),
    minutes = Math.floor((difference % _hour) / _minute),
    seconds = Math.floor((difference % _minute) / _second);

  // fix dates so that it will show two digets
  days = (String(days).length >= 2) ? days : '0' + days;
  hours = (String(hours).length >= 2) ? hours : '0' + hours;
  minutes = (String(minutes).length >= 2) ? minutes : '0' + minutes;
  seconds = (String(seconds).length >= 2) ? seconds : '0' + seconds;

  return [days, hours, minutes, seconds];
}

exports.getTimeLeft = getTimeLeft;


exports.getVars = function(more) {
  more = more || {};
  var now = new Date();
  var nextMonth = new Date(2014, now.getMonth() + 1, 1);
  return merge({
    debug: process.env.DEBUG,
    countdownfinish: nextMonth.toString(),
    timeLeft: getTimeLeft(nextMonth),
  }, more)
}

// route middleware to make sure a user is logged in
exports.isLoggedIn = function(req, res, next) {

  // if user is authenticated in the session, carry on
  if (req.isAuthenticated())
    return next();

  // if they aren't redirect them to the login page
  // remember original requested url for after login
  req.session.returnTo = req.url;
  res.redirect('/login');
}

exports.dbg = function(str, obj){
  if(typeof(DBG_ON) != 'undefined' && DBG_ON !== false) {
    console.log("\n[DBG]", str, JSON.stringify(obj, null, 2));
  }
}
