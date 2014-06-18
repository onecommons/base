// dataForm.js
// trp  12/2011

module.exports._IDkey = _IDkey = '_id'; //"id";
module.exports._typekey = _typekey = '__t'; //"type";

module.exports.dataform = function(){
    var df = { version : '0.1.0' };
    misc = require('./utils');
    pyPop = misc.pyPop;
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
       
       html_attrs = (html_attrs !== undefined) ? html_attrs : {}  // default value
        
       var k,v;
       var rv = '';
       
       for (k in merge) {
         if (merge.hasOwnProperty(k)) {
           v = merge[k];
           if(html_attrs.hasOwnProperty(k)){
              v = html_attrs[k] + ' ' + v
           }
           html_attrs[k] = v
         }
       }   
       
       for (k in html_attrs){
           if(html_attrs.hasOwnProperty(k)){
               rv += k + '= "' + html_attrs[k] + '" ';
           }
       }
       return rv;
   }
   
   // return value of property in object.
   function resolve(obj, propstr, default_val){
       // special case, no test and assignment needed for optional default_val;  we don't mind if default_val is undefined!
       // XXX SECURITY ALERT: sanity check propstr before eval'ing it!! NIY 
       var rv; 
       
       if(obj === undefined){
           rv =  default_val;
       } else if(obj.hasOwnProperty(propstr)) {
           rv =  obj[propstr];
       } else {
           // try drilling down complex propstr like 'foo.bar.quux' or array.
           try {
               with(obj) { rv = eval(propstr); }
           } catch(e) {
               rv = undefined;
           }
       }
       return (rv === undefined ) ? default_val : rv;
   }
   
   df.resolve_test = function(obj, propstr,default_val){
       var result = resolve(obj, propstr, default_val);
       //console.log(result);
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
       
       /* default arg */
       nullAsJSON = (nullAsJSON !== undefined) ? nullAsJSON : false;
       
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
      if(btype !== null && (html_attrs !== undefined )){
          _class = (html_attrs['class'] !== undefined) ? html_attrs['class'] : ''
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
   } // df.setFormBindClass
   
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

   df.selected = function(trueP) { 
     if(trueP){ 
       return 'selected';
     } else {
       return '';
     }
   }
   
   df.form = function(obj,html_attrs){
       html_attrs = (html_attrs !== undefined) ? html_attrs : {}
       
       // NIY -- generate js submit code and place in script slot
       
       var rv = '<form ' + kwtoattr(html_attrs, {'class': 'dbform'}) + '>';
       if(obj.hasOwnProperty(_IDkey)){
           rv += "\n" + '<input type= "hidden" name= "'+ _IDkey + '" value= "' + obj[_IDkey] + '" />';
       }
       if(obj.hasOwnProperty(_typekey)){
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
       html_attrs = (html_attrs === undefined ? {} : html_attrs);
       
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
                       // exception NIY : unexpected bindclass "%s" when setting a default unchecked value 
                   }
               }
           } else {
               html_attrs['value'] = serializeValue(value);
           }
        }
       if(prop === null) {prop = 'none';}
       rv = '<input type= "' + itype + '" ' + kwtoattr(html_attrs) + ' name= "' + prop + '" ';
       rv += (toggleInput && value ? 'checked ' : '') + '/>';
       return rv;
   }
   df.input.safe = true;

   df.hidden = function(prop, htmlAttrs){
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
       return '<textarea name="' + prop + '" ' + kwtoattr(htmlAttrs) + '>' + value + '</textarea>';
   }
   df.textarea.safe = true;
   
   // parse select options array of form ['val1', 'val2'. ... ]
   function parseSimpleOptionsArray(options, selection){
       var rv = '';
       for(var i = 0; i < options.length; i++){
           bindClass = setFormBindClass(options[i]);
           rv += '<option' + (options[i] === selection ? ' selected' : '');
           if(bindClass !== '') {
               rv += ' class= "' + bindClass + '" ';
           }
           rv += '>';
           rv +=  options[i] + '</option>';
       }
       return rv;
   }
   
   // parse select options array of form [['value' : 1, 'label': 'first choice'], ['value': 2, 'label': 'second'], ... ]
   function parseLabeledOptionsArray(options, selection){
       var rv = '';
       for(var i = 0; i < options.length; i++){
            bindClass = setFormBindClass(options[i]['value']);
           rv += '<option' + (options[i]['value'] === selection ? ' selected' : '');
           if(bindClass !== '') {
               rv += ' class= "' + bindClass + '" ';
           }
           rv += 'value= "' + options[i]['value'] + '" >';
           rv += options[i]['label'] + '</option>';
       }
       return rv;
   }
   
   // parse select options array of form [['_id' : @1, 'name': 'first choice', 'notes':['foo', 'bar']], ...]
   function parseObjectOptionsArray(options, selection, notesJoin){
       notesJoin = (notesJoin === undefined) ? ' ' : notesJoin;
       var rv = '';
       for(var i = 0; i < options.length; i++){
           bindClass = setFormBindClass(options[i][_IDkey]);
           rv += '<option' + (options[i][_IDkey] === selection ? ' selected' : '');
           if(bindClass !== '') {
               rv += ' class= "' + bindClass + '" ';
           }
           rv += ' value= "' + options[i][_IDkey] + '" >';
           rv += options[i]['name'] + '(' + options[i]['notes'].join(notesJoin) + ')</option>';
       }
       return rv;
   }
   
   df.select = function(prop, options, htmlAttrs){
       var rv = '';
       var obj = getObj();
       var selection = resolve(obj, prop, pyPop(htmlAttrs, 'defaultValue', undefined));
       var isArray = misc.trueTypeof(selection) === 'array';
       if(isArray) {
           prop += '[]';
       }
       
       rv += '<select name= "' + prop + '" ' + kwtoattr(htmlAttrs) + (isArray ? 'multiple >' : '>');
       
       var ttype = misc.trueTypeof(options[0]);
       if( (ttype === 'string') || (ttype === 'number')){
           rv += parseSimpleOptionsArray(options,selection);  
       } else if(options[0].hasOwnProperty(_IDkey)){
           rv += parseObjectOptionsArray(options, selection);
       } else if(options[0].hasOwnProperty('value')){
           rv += parseLabeledOptionsArray(options,selection);
       } 
       rv += '</select>';
       return rv;
   }
   df.select.safe = true;
   
   return df;
}