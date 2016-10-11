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
  DEPTH:     '...',
  ELLIPSIS_KEY:  '...',
  ELLIPSIS_ELEM:  '...',
  USE_TOJSON: true,
};

module.exports = function(config) {
  config = config || {};
  var MAXKEYS = config.MAXKEYS !== undefined ? config.MAXKEYS : defaults.MAXKEYS;
  var MAXARRAY = config.MAXARRAY !== undefined ? config.MAXARRAY : defaults.MAXARRAY;
  var MAXDEPTH = config.MAXDEPTH !== undefined ? config.MAXDEPTH : defaults.MAXDEPTH;
  var MAXSTRING = config.MAXSTRING !== undefined ? config.MAXSTRING : defaults.MAXSTRING;
  var ELLIPSIS = config.ELLIPSIS !== undefined ? config.ELLIPSIS : defaults.ELLIPSIS;
  var CIRCULAR = config.CIRCULAR !== undefined ? config.CIRCULAR : defaults.CIRCULAR;
  var DEPTH = config.DEPTH !== undefined ? config.DEPTH : defaults.DEPTH;
  var ELLIPSIS_KEY = config.ELLIPSIS_KEY !== undefined ? config.ELLIPSIS_KEY : defaults.ELLIPSIS_KEY;
  var ELLIPSIS_ELEM = config.ELLIPSIS_ELEM !== undefined ? config.ELLIPSIS_ELEM : defaults.ELLIPSIS_ELEM;
  var USE_TOJSON = config.USE_TOJSON !== undefined ? config.USE_TOJSON : defaults.USE_TOJSON;

  var maxkeys = MAXKEYS - 1;
  var maxelems = MAXARRAY - 1;
  var maxstring = MAXSTRING - ELLIPSIS.length;

  var _inflight = new Object();

  function truncateObject(src, inflight, depth) {
    var keys = Object.keys(src);
    var truncateKeys = ELLIPSIS_KEY && keys.length > MAXKEYS;
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
      copy[ELLIPSIS_KEY] = keys.length - maxkeys;
    }

    var dest = (truncateKeys || changed) ? copy : src;
    return dest;
  }

  function truncateArray(src, inflight, depth) {
    var truncateKeys = ELLIPSIS_ELEM && src.length > MAXARRAY;
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
      copy.push(ELLIPSIS_ELEM);
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
        return DEPTH;
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
