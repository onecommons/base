var _               = require('underscore');
var misc = require('./utils');

var _IDkey = '_id'; //"id";
module.exports._IDkey = _IDkey;
var _typekey = '__t'; //"type";
module.exports._typekey = _typekey;

module.exports.dataform = function(){
    var df = { version : '0.1.0' };
    var pyPop = misc.pyPop;
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
          if(misc.trueTypeof(obj) === 'string') {
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
      if(misc.trueTypeof(val) === 'string') {
              return '';  // normal string: don't bother with string.

      } else if(misc.trueTypeof(val) === 'Array') {
          btype = 'json';

      } else if(misc.trueTypeof(val) === 'boolean'){
          btype = 'boolean'

      } else if(misc.trueTypeof(val) === 'number'){
          btype = 'number'

      } else if(misc.trueTypeof(val) === 'null'){
          btype = nullAsJSON ? 'json' : 'null';

      } else {
         btype = null;
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
       } else if(misc.trueTypeof(val) === 'string'){
           return val;
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

   df.formhandler = function() {
      return "$(document).on('submit', '.dbform', function() { \n $(this).dbUpdate(); \n return false; });"
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
       df.opush(obj);
       return rv;
   }
   df.form.safe = true;

   df.form_end = function(){
       df.opop();
       return '</form>';
   }
   df.form_end.safe = true;

   df.input = function(prop, html_attrs, obj){
       html_attrs = _(html_attrs || {}).clone();

       var rv = '';
       var obj = getObj(obj);
       var itype = pyPop(html_attrs,'type', 'text');
       var value = resolve(obj, prop, pyPop(html_attrs, 'defaultValue', undefined));
       var toggleInput = (itype === 'radio' || itype === 'checkbox');
       var bindClass = setFormBindClass(value,html_attrs,toggleInput);
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

   df.hidden = function(prop, htmlAttrs){
       htmlAttrs= _(htmlAttrs || {}).clone();
       var obj = getObj();
       var value = resolve(obj, prop, pyPop(htmlAttrs,'defaultValue', undefined));
       setFormBindClass(value,htmlAttrs);
       if(!htmlAttrs.hasOwnProperty('value')){
           htmlAttrs['value'] = serializeValue(value);
       }
       return '<input type="hidden" name= "' + prop + '" ' + kwtoattr(htmlAttrs) + '/>';
   }
   df.hidden.safe = true;

   df.textarea = function(prop, htmlAttrs){
       var obj = getObj();
       var value = resolve(obj, prop, pyPop('defaultValue', undefined));
       setFormBindClass(value, htmlAttrs);
       return '<textarea name="' + prop + '" ' + kwtoattr(htmlAttrs) + '>'
        + value.replace(/&/g,'&amp;').replace(/</g,'&lt;'); + '</textarea>';
   }
   df.textarea.safe = true;

   function generateOptions(options, selection, valuekey, labelkey){
       var rv = '';
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
           if (selection(value)) {
             htmlattr.selected = '';
           }
           if (value !== label)
             htmlattr.value = serializeValue(value);
           rv += '<option ' + kwtoattr(htmlattr) + '>';
           rv += serializeValue(label).replace(/&/g,'&amp;').replace(/</g,'&lt;');
           rv += '</option>\n';
       }
       return rv;
   }

   df.select = function(prop, options, htmlAttrs){
       htmlAttrs= _(htmlAttrs || {}).clone();
       var rv = '';
       var obj = getObj();
       var labelkey = pyPop(htmlAttrs, 'labelKey', 'label');
       var valuekey = pyPop(htmlAttrs, 'valueKey', "value");
       var selection = resolve(obj, prop, pyPop(htmlAttrs, 'defaultValue', undefined));
       var isArray = misc.trueTypeof(selection) === 'Array';
       if(isArray) {
           prop += '[]';
       }
       rv += '<select name= "' + prop + '" ' + kwtoattr(htmlAttrs) + (isArray ? 'multiple >' : '>');
       var selectedFunc = function(value) {
         if (selection === undefined)
           return false;
         else if (isArray) {
           return selection.indexOf(value) > -1;
         } else {
           return selection == value;
         }
       }
       rv +=  generateOptions(options,selectedFunc, valuekey, labelkey);
       rv += '</select>';
       return rv;
   }
   df.select.safe = true;

   return df;
}
