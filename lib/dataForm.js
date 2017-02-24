var _ = require('underscore');
var moment = require('moment');

var _IDkey = '_id'; //"id";
module.exports._IDkey = _IDkey;
var _typekey = '__t'; //"type";
module.exports._typekey = _typekey;
var _versionkey = '__v'; //"version";
module.exports._versionkey = _versionkey;

function trueTypeof(value) {
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

// like the python dictionary pop.
// return obj[prop] and remove property from obj.
// if obj[prop] doesn't exist, return default value.
function pyPop(obj, prop, defaultValue){
   obj = (obj === undefined) ? {} : obj;

   if(obj.hasOwnProperty(prop)){
       var rv =  obj[prop];
       delete obj[prop];
       return rv;
   } else {
       return defaultValue;
   }
}

module.exports.dataform = function(context){
    context = context || {};
    var df = {
      version : '0.1.0',
      // default to GMT
      displayTz: context.tz || 'Z'
    };

    // ---------------------------------
    //  private vars and methods
    // ---------------------------------
     var ostack = []; // context stack

   function o(){
       return ostack[ostack.length-1];
   }


   // may have an additional merge obj, with more key->value pairs.
   // They are all merged into the referenced html_attrs object, and the function
   // returns a string of the key/values formatted for inclusion and html attributes.
   function kwtoattr(html_attrs, merge){
      var k,v;
      var rv = '';
      if (merge) {
       for (k in merge) {
         if (merge.hasOwnProperty(k)) {
           v = merge[k];
           if(html_attrs.hasOwnProperty(k)){
              v = html_attrs[k] + ' ' + v
           }
           html_attrs[k] = v
         }
       }
     }

     var booleanAttributes = " hidden novalidate formnovalidate readonly required multiple autofocus disabled selected";

       for (k in html_attrs){
          if(!html_attrs.hasOwnProperty(k) || typeof html_attrs[k] !== 'string')
            continue;

          if (booleanAttributes.indexOf(" " + k + " ") > -1) {
            if (html_attrs[k]==k || html_attrs[k]=="") //otherwise omit
              rv += k + " ";
          } else {
           rv += k + '= "' + html_attrs[k].replace(/&/g,'&amp;').replace(/"/g,'&quot;') + '" ';
         }
       }
       return rv;
   }

   // return value of property in object.
   function resolve(obj, propstr, default_val){
       // special case, no test and assignment needed for optional default_val;  we don't mind if default_val is undefined!
       // note: eval called on propstr!
       var rv;

       if(obj === undefined){
           rv =  default_val;
       } else if(obj.hasOwnProperty(propstr)) {
           rv =  obj[propstr];
       } else {
           //treat [] as index 0
           propstr = propstr.replace(/\[\]/g,'[0]');
           // try drilling down complex propstr like 'foo.bar.quux' or array.
           try {
             //eval like this to enable "with {}" in strict mode (for babel compatibility)
             rv = (new Function( "with(this) { return " + propstr + "}")).call(obj);
           } catch(e) {
               rv = undefined;
           }
       }
       return (rv === undefined ) ? default_val : rv;
   }

   function getObj(obj){
      if(obj === undefined) {
          return o();  // if no o key in param object passed in, just use current object.
      } else {
          if(trueTypeof(obj) === 'string') {
              // if o is a string, treat it as a property name of current object.
              return resolve(o(), obj);
          } else {
              // if a legit non-string object itself, return it directly.
              return obj;
          }
      }
   }

   function setFormBindClass(val, html_attrs, nullAsJSON){
      var btype, bindClass;
      var type = typeof val;
      if(type === 'string') {
          return '';  // normal string: don't bother with string.
      } else if (type === 'object') {
          if (val === null && !nullAsJSON) {
            btype = 'null';
          } else if (val instanceof Date) {
            btype = 'date';
          } else {
            btype = 'json';
          }
      } else if (type === 'boolean'){
          btype = 'boolean'
      } else if(type === 'number'){
          btype = 'number'
      } else {
         return ''; //undefined, default to treating as string
      }

      bindClass = "type[" + btype + "]";
      if(btype !== null && html_attrs){
          var _class = html_attrs['class'] || '';
          if(_class !== '' && (_class !== undefined) ) {
             if( _class.search(/type\[(.*)\]/) === -1) {
                 // type specification not already in _class string: add it.
                html_attrs['class'] = _class + ' ' + bindClass;
             }
          } else {
              html_attrs['class'] = bindClass;
          }
      }
      return bindClass;
   }

   function serializeValue(val){
       if(val === undefined || val === null){
           return ''
       } else if (typeof val === 'string'){
           return val;
       } else if (val instanceof Date) {
         // adjust time to timezone to display
           return moment(val).utcOffset(df.displayTz).format('YYYY-MM-DDTHH:mm:ss.SSS');
       } else {
           return JSON.stringify(val);
       }
   }

   // ------------------------------------------------------
   //     Exported methods
   // ------------------------------------------------------

   df.opush = function(oin){
       ostack.push(oin);
       return o();
   }

   df.opop = function(){
       return ostack.pop();
   }

  df.getVal = function(prop) {
     return getObj(prop);
   }

   df.formhandler = function(method, callback) {
      method = method || 'dbUpdate';
      callback = callback || '';
      return "$(document).on('submit', '.dbform', function() { \n $(this)."
              + method +  "(" + callback + "); \n return false; });";
   }

   df.form = function(obj,html_attrs){
       html_attrs = html_attrs || {};
       var rv = '<form ' + kwtoattr(html_attrs, {'class': 'dbform'}) + '>';
       if(obj[_IDkey] !== undefined){
           rv += "\n" + '<input type= "hidden" name= "'+ _IDkey + '" value= "' + obj[_IDkey] + '" />';
       }
       if(obj[_typekey] !== undefined){
           rv += "\n" + '<input type= "hidden" name= "'+ _typekey +'" value= "' + obj[_typekey] + '" />';
       }
       if(obj[_versionkey] !== undefined){
           rv += "\n" + '<input type= "hidden" name= "'+ _versionkey +'" value= "' + obj[_versionkey] + '" />';
       }
       df.opush(obj);
       return rv;
   }
   df.form.safe = true;

   df.form_end = function(){
       df.opop();
       return '</form>';
   }
   df.form_end.safe = true;

   function getInputType(value, defaultType) {
     if (typeof value === 'boolean') {
       return 'checkbox';
     } else if (typeof value === 'number') {
      return 'number';
     }  else if (value instanceof Date) {
      return 'datetime-local';
     }
     return defaultType || 'text';
   }

   df.input = function(prop, html_attrs, obj){
       html_attrs = _(html_attrs || {}).clone();
       var itype = pyPop(html_attrs,'type', 'text');
       if (itype === 'textarea') {
        return df.textarea(prop, html_attrs, obj);
       }
       var rv = '';
       var obj = getObj(obj);
       var value = resolve(obj, prop, pyPop(html_attrs, 'defaultValue'));
       if (pyPop(html_attrs, 'guessInputType')) {
         itype = getInputType(value, itype);
       }
       var toggleInput = (itype === 'radio' || itype === 'checkbox');
       var bindClass = setFormBindClass(value,html_attrs,toggleInput);
       if (itype === 'datetime-local') {
         html_attrs['data-tz'] = df.displayTz;
       }
       if (itype === 'number' && html_attrs.step === undefined) {
         html_attrs.step = 'any';
       }
       if(!html_attrs.hasOwnProperty(value)){
           if(toggleInput && !value){
               if(html_attrs.hasOwnProperty('defaultOnValue')){
                   html_attrs['value'] = html_attrs['defaultOnValue'];
                   delete html_attrs['defaultOnValue'];
               } else {
                   if(bindClass === 'type[string]' || bindClass === undefined || bindClass === '' || bindClass === null){
                       html_attrs['value'] = 'on';
                   } else if (bindClass === 'type[number]'){
                       html_attrs['value'] = '1';
                   } else if (bindClass === 'type[boolean]' || bindClass === 'type[json]'){
                       html_attrs['value'] = 'true';
                   } else {
                       //XXX exception NIY : unexpected bindclass "%s" when setting a default unchecked value
                   }
               }
           } else {
             html_attrs['value'] = serializeValue(value);
           }
        }
       if(!prop) {prop = '';}
       rv = '<input type= "' + itype + '" ' + kwtoattr(html_attrs) + ' name= "' + prop + '" ';
       rv += (toggleInput && value ? 'checked ' : '') + '/>';
       return rv;
   }
   df.input.safe = true;

   df.hidden = function(prop, htmlAttrs, obj){
       htmlAttrs= _(htmlAttrs || {}).clone();
       var obj = getObj(obj);
       var value = resolve(obj, prop, pyPop(htmlAttrs,'defaultValue'));
       setFormBindClass(value,htmlAttrs);
       if(!htmlAttrs.hasOwnProperty('value')){
           htmlAttrs['value'] = serializeValue(value);
       }
       return '<input type="hidden" name= "' + prop + '" ' + kwtoattr(htmlAttrs) + '/>';
   }
   df.hidden.safe = true;

   df.textarea = function(prop, htmlAttrs, obj){
       htmlAttrs= _(htmlAttrs || {}).clone();
       var obj = getObj(obj);
       var value = resolve(obj, prop, pyPop(htmlAttrs, 'defaultValue')) || '';
       setFormBindClass(value, htmlAttrs);
       return '<textarea name="' + prop + '" ' + kwtoattr(htmlAttrs) + '>'
        + value.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</textarea>';
   }
   df.textarea.safe = true;

   function generateOptions(options, isSelected, valuekey, labelkey, forceValue){
       var rv = '';
       var selectionFound = false;
       for(var i = 0; i < options.length; i++){
           var value, label, htmlattr;
           if (typeof options[i] !== 'object') {
             label = value = options[i];
             htmlattr = {};
           } else {
             htmlattr = _(options[i]).clone();
             value = pyPop(htmlattr,
               htmlattr[_IDkey] !== undefined ? _IDkey : valuekey);
             label = pyPop(htmlattr,labelkey);
           }
           setFormBindClass(value, htmlattr);
           if (isSelected(value)) {
             selectionFound = true;
             htmlattr.selected = '';
           }
           if (value !== label || forceValue)
              htmlattr.value = serializeValue(value);
           rv += '<option ' + kwtoattr(htmlattr) + '>';
           rv += serializeValue(label).replace(/&/g,'&amp;').replace(/</g,'&lt;');
           rv += '</option>\n';
       }
       return {rv:rv, selectionFound:selectionFound};
   }

   df.select = function(prop, options, htmlAttrs){
       htmlAttrs= _(htmlAttrs || {}).clone();
       var rv = '';
       var obj = getObj();
       var labelkey = pyPop(htmlAttrs, 'labelKey', 'label');
       var valuekey = pyPop(htmlAttrs, 'valueKey', "value");
       var forceValue = pyPop(htmlAttrs, 'forceValue');
       var selection = resolve(obj, prop, pyPop(htmlAttrs, 'defaultValue'));
       var isArray = Array.isArray(selection);
       if (isArray) {
           prop += '[]';
       }
       if (pyPop(htmlAttrs, 'setBindType')) {
         setFormBindClass(isArray ? selection[0] : selection, htmlAttrs);
       }
       var objectLabelKey = pyPop(htmlAttrs, 'objectLabelKey');
       var objectValueKey = pyPop(htmlAttrs, 'objectValueKey');
       rv += '<select name= "' + prop + '" ' + kwtoattr(htmlAttrs) + (isArray ? 'multiple >' : '>');

       var selectedFunc = function(value) {
         if (selection === undefined) {
           return false;
         } else if (isArray) {
           return selection.indexOf(value) > -1;
         } else if (objectValueKey) {
           return selection && selection[objectValueKey] == value;
         } else {
           return selection == value;
         }
       }
       var optionArray = options;
       if (!optionArray) {
         optionArray = _.map(isArray && selection || [selection], function(val) {
           var obj = {};
           if (val && objectLabelKey) {
             obj[labelkey] = val[objectLabelKey];
             obj[valuekey] = val[objectValueKey];
           } else {
             obj[labelkey] = obj[valuekey] = val;
           }
           return obj;
         });
       }
       var optionInfo = generateOptions(optionArray,selectedFunc, valuekey, labelkey, forceValue);
       rv += optionInfo.rv;
       var selectionValue = objectValueKey && selection ? selection[objectValueKey] : selection;
       if (!optionInfo.selectionFound && !isArray) {
         // the value not found in select list, add it and set as selection
         var optionAttr = {};
         setFormBindClass(selectionValue, optionAttr);
         if (forceValue) {
          optionAttr.value = serializeValue(selectionValue);
         }
         rv += '<option selected ' + kwtoattr(optionAttr) + '>';
         var selectionLabel = objectLabelKey && selection ? selection[objectLabelKey] : selectionValue;
         rv += serializeValue(selectionLabel).replace(/&/g,'&amp;').replace(/</g,'&lt;');
         rv += '</option>\n';
       }
       rv += '</select>';
       return rv;
   }
   df.select.safe = true;

   return df;
}
