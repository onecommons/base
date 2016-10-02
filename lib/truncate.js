//usage:
//var truncate = require('truncate')({MAXKEYS:30});
//var truncatedObject = truncate(obj);
//if (truncatedObject !== obj) {
// it has been truncated
//}

var defaults = {
  MAXKEYS:   10, //max keys to display (including the ellipsis)
  MAXARRAY:  10, //max elements to display (including the ellipsis)
  MAXDEPTH:  3,
  MAXSTRING: 200, //max characters to display (including the ellipsis)
  ELLIPSIS:  '...',
  CIRCULAR:  '...',
  ELLIPSISKEY:  '...',
  USE_TOJSON: true,
};

// XXX add option to not add ellipsis to object, arrays and strings
module.exports = function(config) {
  config = config || {};
  var MAXKEYS = config.MAXKEYS !== undefined ? config.MAXKEYS : defaults.MAXKEYS;
  var MAXARRAY = config.MAXARRAY !== undefined ? config.MAXARRAY : defaults.MAXARRAY;
  var MAXDEPTH = config.MAXDEPTH !== undefined ? config.MAXDEPTH : defaults.MAXDEPTH;
  var MAXSTRING = config.MAXSTRING !== undefined ? config.MAXSTRING : defaults.MAXSTRING;
  var ELLIPSIS = config.ELLIPSIS !== undefined ? config.ELLIPSIS : defaults.ELLIPSIS;
  var CIRCULAR = config.CIRCULAR !== undefined ? config.CIRCULAR : defaults.CIRCULAR;
  var ELLIPSISKEY = config.ELLIPSISKEY !== undefined ? config.ELLIPSISKEY : defaults.ELLIPSISKEY;
  var USE_TOJSON = config.USE_TOJSON !== undefined ? config.USE_TOJSON : defaults.USE_TOJSON;

  var maxkeys = MAXKEYS - 1;
  var maxelems = MAXARRAY - 1;
  var maxstring = MAXSTRING - ELLIPSIS.length;

  var _inflight = new Object();

  function truncateObject(src, inflight, depth) {
    var keys = Object.keys(src);
    var truncateKeys = keys.length > MAXKEYS;
    var copy = {};
    var changed = false;
    keys.slice(0, truncateKeys ? maxkeys : MAXKEYS).forEach(function(key) {
      var srcval = src[key];
      var val = _truncate(srcval, inflight, depth);
      copy[key] = val;
      if (!changed && !Object.is(val, srcval)) {
        changed = true;
      }
    });
    if (truncateKeys) {
      copy[ELLIPSISKEY] = keys.length - maxkeys;
    }

    var dest = (truncateKeys || changed) ? copy : src;
    return dest;
  }

  function truncateArray(src, inflight, depth) {
    var truncateKeys = src.length > MAXARRAY;
    var copy = [];
    var changed = false;
    var length = Math.min(src.length, truncateKeys ? maxelems : MAXARRAY);
    for (var i = 0; i < length; i++) {
      var srcval = src[i];
      var val = _truncate(srcval, inflight, depth);
      copy[i] = val;
      if (!changed && !Object.is(val, srcval)) {
        changed = true;
      }
    }
    if (truncateKeys) {
      copy.push(ELLIPSIS);
    }

    var dest = (truncateKeys || changed) ? copy : src;
    return dest;
  }

  function _truncate(value, inflight, depth) {
    if (typeof value === "string") {
      if (value.length > maxstring) {
        return value.slice(0, maxstring) + ELLIPSIS;
      }
    } else if (typeof value === 'object') {
      if (value === null) {
        return null;
      }
      if (depth > MAXDEPTH) {
        return ELLIPSIS;
      }
      var jsonValue;
      if (USE_TOJSON && value.toJSON) {
        jsonValue = value.toJSON();
        if (typeof jsonValue !== 'object') {
          return _truncate(jsonValue, inflight, depth);
        }
      }
      var seen = inflight.get(value);
      if (seen) {
        return CIRCULAR;
      }
      var inflightReplacement = new Object();
      inflight.set(value, inflightReplacement);
      if (jsonValue !== undefined) {
        value = jsonValue;
      }
      var returnValue;
      if (Array.isArray(value)) {
        returnValue = truncateArray(value, inflight, depth+1);
      } else  {
        returnValue = truncateObject(value, inflight, depth+1);
      }

      inflight.delete(value);
      return returnValue;
   }
   return value;
  }

  function truncate(value) {
    var inflight = new Map();
    value = _truncate(value, inflight, 1);
    return value;
  }

  truncate.defaults = defaults;
  Object.assign(truncate, defaults, config);
  return truncate;
};
