/*
 * Copyright 2009-2010 by the Vesper team, see AUTHORS.
 * Dual licenced under the GPL or Apache2 licences, see LICENSE.
 */

var konsole = {
    log : function() {
      if (window.console && window.console.log)
        window.console.log.apply(window.console, Array.prototype.slice.call(arguments));
    },
    assert : function(expr, msg) {
      if (!expr) {
        if (window.console && window.console.assert)
          //console.assert doesn't abort, just logs
          window.console.assert.apply(window.console, Array.prototype.slice.call(arguments));
        debugger; //note: no-op if debugger isn't active
        throw new Error("assertion failed " + (msg || '')); //abort
      }
    }
};

var _IDkey = '_id';

var Txn = function(url) {
  this.autocommit = false;
  this.requests = [];
  this.txnId = ++Txn.prototype.idcounter;
  this.txnComment = '';
  this.fileuploads = [];
  if (url)
    this.url = url;
  //this.pendingChanges = {};
  //this.successmsg = '';
  //this.errormsg = '';
}

Txn.prototype = {

    idcounter : 0,

    url : '/datarequest',

    execute : function(action, data, callback, elem) {
        var elem = elem || document;
        var requestId = this.requests.length+1;

        //XXX allow requestid to be specified in data so it can replace a previous request?
        //XXX if a new request updates an object in a previous request
        //    update the previous object
        //different requests but the same id
        /*
        if (typeof data.id != 'undefined') {
             if (this.requests[data.id-1]) {
                if (action == 'update') {
                    $.extend(this.requests[data.id-1],data);
                } else if (action == 'add') {
                    throw new Error('already added');
                }
            }
        } else { this.requests.push(...); }
        */

        //JSON-RPC 2.0 see http://groups.google.com/group/json-rpc/web/json-rpc-2-0
        if (action) {
          this.requests.push( {
              jsonrpc : '2.0',
              method : action,
              params : data,
              id : requestId
          });
        }
        //action can be empty if just doing a file upload -- but we still want to
        //generate a request id so callbacks work

        if (callback) { //bind callback to data event
            $(elem).one('dbdata-'+this.txnId, function(event, responses) {
                if (responses.error) { //an error object, not an array of responses
                  // note: if callback returns false event bubbling is stopped
                  return callback.call(elem, null, responses.error);
                }

                var resultResponse = null;
                var errorResponse = null;
                var found = false;
                for (var i=0; i < responses.length; i++) {
                    var response = responses[i];
                    if (response.id == requestId) {
                      found = true;
                      if (response.error) {
                          errorResponse = response.error;
                      } else {
                          resultResponse = response.result;
                      }
                    }
                }

                //in the case of file upload there can be multiple responses
                //with the same id, we only want to invoke the callback once
                //In the callback, we always want to report errors
                //and give priority to the main request, whose response will
                //always come after the upload response.
                if (found) {
                  // note: if callback returns false event bubbling is stopped
                  return callback.call(elem, resultResponse, errorResponse);
                }
            });
        }

        if (this.autocommit)
            this.commit();

        return requestId;
   },

   _addFileInput: function(fileinput, obj, requestid) {
     if (fileinput.files && fileinput.files.length) {
       fileinput.db_Id = obj[_IDkey];
       fileinput.db_RequestId = requestid;
       this.fileuploads.push(fileinput);
     }
   },

  _send: function(data, ajaxCallback, elem, contentType, timeout) {
    var options = {
      type: 'POST',
      url: this.url,
      data: data,
      processData: false,
      contentType: contentType,
      success: ajaxCallback,
      error: ajaxCallback,
      dataType: "json",
      xhr: function() {
        var xhr = new window.XMLHttpRequest();
        // 'this' will be the settings object
        $(elem).trigger('ajaxXHRSetup', [xhr, this]);
        return xhr;
      }
    };
    if (typeof timeout === 'number')
      options.timeout = timeout;
    $.ajax(options);
  },

   doUpload: function(ajaxCallback, elem){
     var formData = new FormData();
     var This = this;
     this.fileuploads.forEach(function(fileInputElement) {
       if (fileInputElement.files && fileInputElement.files.length
           && fileInputElement.getAttribute('data-dbmethod')) {
         var params = { 'name' : fileInputElement.name };
         if (fileInputElement.db_Id !== undefined)
          params[_IDkey] = fileInputElement.db_Id;
         This.requests.unshift({ //put these first
           jsonrpc: '2.0',
           method : fileInputElement.getAttribute('data-dbmethod'),
           params : params,
           id     : fileInputElement.db_RequestId
         })
       }
     });
     var requests = JSON.stringify(this.requests);
     this.requests = [];
     formData.append('jsonrpc', requests);
     this.fileuploads.forEach(function(fileInputElement) {
       if (fileInputElement.files && fileInputElement.files.length) {
         formData.append(fileInputElement.name, fileInputElement.files[0],
                                              fileInputElement.files[0].name);
       }
     });
     this.fileuploads = [];
     this._send(formData, ajaxCallback, elem, false);
   },

    /*
    */
    commit : function(callback, elem) {
        var elem = elem || document;
        var txnId = this.txnId;
        if (callback) { //callback signature: function(responses, requests)
            $(elem).one('dbdata-'+txnId, function() {
              return callback.apply(this, Array.prototype.slice.call(arguments,1) );
            });
        }
        var comment = this.txnComment;
        var request = this.requests;
        //var clientErrorMsg = this.clientErrorMsg;
        function ajaxCallback(data, textStatus) {
            //responses should be a list of successful responses
            //if any request failed it *may or may not* be an http-level error
            //depending on server-side implementation
           // konsole.log("datarequest", data, textStatus, 'dbdata.'+txnId, comment);
            if (textStatus == 'success') {
                data.getErrors = function() {
                  if (this.error) return [this.error];
                  var errors = [];
                  for (var i=0; i < this.length; i++) {
                    if (this[i].error)
                      errors.push(this[i].error);
                  }
                  return errors;
                };
                data.hasErrors = function() { return this.getErrors().length > 0;}
                if (false !== $(elem).triggerHandler('dbdata-'+txnId, [data, request, comment])) {
                  $(elem).trigger('dbdata', [data, request, comment]);
                }
            } else {
                //when textStatus != 'success', data param will be a XMLHttpRequest obj
                var errorObj = {"jsonrpc": "2.0", "id": null,
                  "error": {"code": -32000,
                        "message": data.statusText || textStatus,
                        'data' : data.responseText
                  },
                  hasErrors: function() { return true;},
                  getErrors: function() { return [this.error];}
                };
                if (false !== $(elem).triggerHandler('dbdata-'+txnId, [errorObj, request, comment])) {
                  $(elem).trigger('dbdata', [errorObj, request, comment]);
                }
            }
         };

        /*
        //XXX consolidate updates to the same object
        var changes = [];
        for (var name in pendingChanges ) {
            changes.push( pendingChanges[name] );
        }
        this.pendingChanges = {};
        */
        //XXX path should be configurable
        //konsole.log('requests', this.requests);
        if (this.requests.length || this.fileuploads.length) {
            if (this.txnComment) {
                this.requests.push({
                    jsonrpc : '2.0',
                    method : 'transaction_info',
                    params : { 'comment' : this.txnComment },
                    id : this.requests.length+1
                });
                this.txnComment = '';
            }
            if (this.fileuploads.length) {
              konsole.assert(FormData);
              this.doUpload(ajaxCallback, elem);
            } else {
              var requests = JSON.stringify(this.requests);
              this.requests = [];
              this._send(requests, ajaxCallback, elem, 'application/json');
          }
        }
  }
};

/*
Add a jquery plugin that adds methods for serializing forms and HTML5-style microdata annotated elements.

//This example saves immediately, and invokes a callback on successs on each element.
$('.elem').dbUpdate(function(data) { $(this); });

//This example atomically commits multiple changes
$('.elems').dbBegin().dbUpdate().dbAdd({ id : '@this', anotherprop : 1}).dbCommit();

var txn = new Txn()
$(.objs).dbUpdate(txn);
$(.objs).dbUpdate(txn, function(data){ $(this); });
txn.commit();
*/

(function($) {

    function deduceArgs(args) {
        //return data, { callback, txn, comment}
        // accepts: [] | [data] | [callback] | [data, options] | [null, options] | [null, callback]
        var data = null;
        if (args[0]) {
            if (!jQuery.isFunction(args[0])) {
                data = args.shift();
                //sanity check first arg
                konsole.assert( !jQuery.isFunction(data.callback),
                    "options dictionary must be second parameter, not first");
            }
        } else if (args.length > 1) {
            args.shift(); //[null, callback] or [null, options]
        }
        var options = {};
        if (args[0]) {
            if (jQuery.isFunction(args[0])) {
                options.callback = args[0];
            } else {
                options = args[0];
            }
        }
        return [data, options];
    }

    $.fn.extend({
        /*
        action [data] [options]
        */
      _executeTxn : function() {
         //copy to make real Array
         var args = Array.prototype.slice.call( arguments );
         var action = args.shift();
         args = deduceArgs(args);
         var txn = args[1].txn, data = args[0], callback = args[1].callback,
            comment = args[1].comment, override = args[1].override,
            fileinput = args[1].fileinput;
         var commitNow = false;
         // set changedOnly default to true unless action == replace
         var changedOnly = typeof args[1].changedOnly !== 'undefined'
                              ? args[1].changedOnly : action !== 'replace';
         if (!txn) {
             txn = this.data('currentTxn');
             if (!txn) {
                 txn = new Txn(args[1].url || $.db.url);
                 commitNow = true;
             } else if (args[1].url) {
               konsole.assert(txn.url ===  args[1].url);
             }
         }
      try {
         //konsole.log('execute', action, data, callback);
         var requestIds = [];
         if (data) {
            if (action == 'query') {
                if (!data.conditions) {
                    data = { conditions : data };
                }
                //assert data.query;
                var thisid = this.attr('itemid');
                if (thisid) {
                    if (!data.bindvars) {
                        data.bindvars = {}
                    }
                    data.bindvars['this'] =  thisid;
                }
            } else if (!data[_IDkey] && this.attr('itemid')) {
                data[_IDkey] = this.attr('itemid');
            }
            requestIds = [txn.execute(action, data, callback, this.length ? this[0] : null)];
            if (fileinput)
             txn._addFileInput(fileinput, data, requestIds[0]);
         } else {
            konsole.assert(!fileinput);
            requestIds = this.map(function() {
                var obj = bindElement(this, false, undefined, changedOnly);
                if (override) {
                  if (typeof override == 'function')
                    obj = override(obj);
                  else
                    $.extend(obj[0], override);
                }

                var requestid = txn.execute(action, obj, callback, this);
                $(this).find('[data-dbmethod]').each(function() {
                  txn._addFileInput(this, obj, requestid);
                });
                //konsole.log('about to', action, 'obj', obj);
                return requestid;
            }).get();
         }
         if (comment) { //XXX this is all kind of hacky
            comment = comment.replace('$new0', '$new'+requestIds[0]);
            if (txn.txnComment)
                txn.txnComment += ' and ' + comment;
            else
                txn.txnComment = comment;
         }
       } catch (err) {
         // invoke callback if it hasn't already been bound
         // (if we have requestIds then it has)
         var rollbackCB = null;
         if (callback && !requestIds.length) {
           var elem = this;
           rollbackCB = function(response) {
              // note: if callback returns false event bubbling is stopped
              return callback.call(elem, null, response.error);
           };
         }
         this.dbRollback(rollbackCB, err, txn);
         return this;
       }
         if (commitNow)
            txn.commit(null, this);
         return this;
     },

     dbData : function(rootOnly, changedOnly) {
         return this.map(function() {
             return bindElement(this, rootOnly, undefined, changedOnly);
         });
     },

     /*
     [data] [callback] or data [options]
     */
     dbAdd : function(a1, a2, a3) {
         return this._executeTxn('add', a1,a2);
     },
     dbCreate : function(a1, a2, a3) {
         return this._executeTxn('create', a1,a2);
     },
     dbUpdate : function(a1, a2, a3) {
         return this._executeTxn('update', a1,a2);
     },
     dbReplace : function(a1, a2, a3) {
         return this._executeTxn('replace', a1,a2);
     },
     dbQuery : function(a1, a2, a3) {
        return this._executeTxn('query', a1,a2);
     },
     dbRemove : function(a1,a2,a3){
        return this._executeTxn('remove', a1,a2);
     },
     dbDestroy : function(a1, a2, a3) {
        return this._executeTxn('destroy', a1, a2);
     },
     dbBegin : function(url) {
        this.data('currentTxn', new Txn(url || $.db.url));
        return this;
     },
     dbCommit : function(callback) {
        var txn = this.data('currentTxn');
        if (txn) {
            this.removeData('currentTxn'); //do this now so callbacks aren't in this txn
            txn.commit(callback, this);
        } else {
            konsole.error('commit with no txn');
        }
        return this;
     },
     dbRollback : function(callback, err, txn_) {
        var txn = this.data('currentTxn')|| txn_;
        if (txn) {
            this.removeData('currentTxn'); //do this now so callbacks aren't in this txn
            var errorObj = {"jsonrpc": "2.0", "id": null,
              "error": {"code": -32001,
                  "message": "client-side rollback",
                  'data' : err
                },
              hasErrors: function() { return true;},
              getErrors: function() { return [this.error];}
            };
            if (callback) { //callback signature: function(responses, requests)
                this.one('dbdata-'+txn.txnId, function() {
                  return callback.apply(this, Array.prototype.slice.call(arguments,1) );
                });
            }
            if (false !== this.triggerHandler('dbdata-'+txn.txnId, [errorObj, txn.requests, txn.txnComment])) {
              this.trigger('dbdata', [errorObj, txn.requests, txn.txnComment]);
            }
        } else {
            konsole.log('warning: rollback with no txn');
        }
        return this;
     }
     /* XXX we don't need this, right?
     // treats additions and removals from array separately from updates to properties and items
    ,dbSave: function(callback) {
      var data = this.dbData(false, true).get(0);
      var actions = {
        remove: {},
        add: {}
      };
      var keys = [];
      for (var key in data) {
        if (data.hasOwnProperty(key)) {
          keys.push(key);
        }
      }
      $.each(keys, function(index, key) {
         var val = data[key];
         if ($.isArray(val)) {
          data[key] = Binder.Util.filter(val, function(item) {
            // exclude items with __action property
            var keep = !item || !item.__action;
            if (item && item.__action && actions[item.__action]) {
              var arr = actions[item.__action][key];
              if (!arr) {
                arr = [];
                actions[item.__action][key] = arr;
              }
              delete item.__action;
              arr.push(item);
             }
            return keep;
          });
        }
      });
      var removes = actions.remove;
      var adds = actions.add;
      this.dbBegin();
      this.dbUpdate(data);
      for (var prop in removes) {
        if (removes.hasOwnProperty(prop)) {
          removes[_IDkey] = data[_IDkey];
          this.dbRemove(removes);
          break;
        }
      }
      for (var prop in adds) {
        if (adds.hasOwnProperty(prop)) {
          adds[_IDkey] = data[_IDkey];
          this.dbAdd(adds);
          break;
        }
      }
      this.dbCommit(callback);
      return this;
    }
    */
    ,dbRenderToString: function(model, templatename) {
      if (model === undefined)
        model = this.data('_model');
      if (templatename === undefined)
        templatename = this.data('_template');
      return swig.run($.templates[templatename], model, templatename);
    }
    ,dbRender: function(model, templatename) {
      this.html(this.dbRenderToString(model, templatename));
      return this;
    }
    ,dbModel: function() {
      return this.data('_model');
    }

     /*
     cmd [data] [callback] or cmd data [options] or cmd callback
     */
    ,dbExecute: function(cmd, a1, a2) {
      if (typeof cmd !== 'string') {
        a1 = cmd;
        a2 = a1;
        cmd = this.getAttribute('data-dbmethod');
      }
      if (jQuery.isFunction(a1)) { //callback only
        konsole.assert(a2 === undefined);
        a2 = a1;
        a1 = null;
      }
      konsole.assert(typeof cmd === 'string', "first argument of dbExecute should be a string")
      var split = cmd.split('#');
      if (split.length > 1) {
        url = split[0];
        cmd = split[1];
        if (jQuery.isFunction(a2)) {
          var callback = a2;
          a2 = {callback: callback};
        } else if (!a2) {
          a2 = {};
        }
        a2.url = url;
      }

      return this._executeTxn(cmd, a1,a2);
    }
   })
   $.db = { url : null, options : {} };
})(jQuery);

function parseAttrPropValue(data) {
    var jsonstart = /^({|\[|"|-?\d|true$|false$|null$)/;
    if ( typeof data === "string" ) {
        try {
            return jsonstart.test( data ) ? jQuery.parseJSON( data ) : data;
        } catch( e ) {
            return data;
        }
    } else {
        return data;
    }
}

function bindElement(elem, rootOnly, forItemRef, changedOnly) {
    if (elem.nodeName == 'FORM' &&
            !elem.hasAttribute('itemscope') && !elem.hasAttribute('itemid')) {
        var binder = Binder.FormBinder.bind( elem, undefined, changedOnly);
        return binder.serialize();
    }

    //otherwise emulate HTML microdata scheme
    //see http://dev.w3.org/html5/spec/microdata.html
    //except also include forms controls serialized as above
    var itemElems = (forItemRef && forItemRef.itemElems) || [];

    function setAttrProps(elem, item) {
        var type = elem.getAttribute('itemtype');
        if (type)
            item['type'] = type;
        var attrs = elem.attributes, name;
        for ( var i = 0, l = attrs.length; i < l; i++ ) {
            name = attrs[i].name;
            if ( name.indexOf( "itemprop-" ) === 0 ) {
                var val = elem.getAttribute(name);
                item[name.substr( 9 )] = parseAttrPropValue(val);
            }
        }
    }

    function getItem(elem) {
        var item = $(elem).data('item');
        if (typeof item != 'undefined') {
            return item;
        }
        item = {};
        var id = $(elem).attr('itemid');
        if (id)
            item['id'] = id;
        $(elem).data('item', item);
        itemElems.push(elem);
        return item;
    }

    function getPropValue(elem) {
        var $this = $(elem);
        if (elem.hasAttribute('itemscope') || $this.attr('itemid')) {
            return getItem(elem);
        }
        var attr = { 'META' : 'content',
          'IMG' : 'src',
          'EMBED' : 'src',
          'IFRAME' : 'src',
          'AUDIO' : 'src',
          'SOURCE' : 'src',
          'VIDEO' : 'src',
          'A' : 'href',
          'AREA' : 'href',
          'LINK' : 'href',
          'OBJECT' : 'data',
          'TIME' : 'datetime'
        }[elem.tagName];
        if (attr) {
            //XXX resolve urls to absolute urls
            return $this.attr(attr) || '';
        } else {
            return $this.text();
        }
    }

    function addProp(item, elem) {
        var $this = $(elem);
        var propnames = $this.attr('itemprop').split(/\s+/);
        var value = getPropValue(elem);
        for (var i=0; i<propnames.length; i++){
            var propname = propnames[i];
            var current = item[ propname ];
            if (typeof current != 'undefined') {
                if ($.isArray(current)) {
                    current.push(value);
                } else {
                    item[propname] = [current, value];
                }
            } else {
                item[propname] = value;
            }
        }
    }

    var descendPredicate;
    if (typeof rootOnly == 'function') {
        descendPredicate = rootOnly;
    } else {
        //descend unless the value is an itemid (i.e. dont follow separate items)
        descendPredicate = function(elem) { return !$(elem).attr('itemid'); }
    }

    function descend($this) {
        //remove because itemidonly isn't cleaned up properly
        //and so might be set from elsewhere
        $this.removeData('itemidonly');
        return $this.children().map(function() {
          if (descendPredicate(this)) {
             var desc = descend($(this));
             if (desc.length) {
                return [this].concat(desc.get());
             } else {
                return this;
             }
          } else { //we want this item to just be a ref
             $(this).data('itemidonly', true);
             return this;
          }
        });
    }

    var elems = rootOnly ? descend($(elem)) : $(elem).find('*');
    if (forItemRef || !$(elem).is('[itemscope],[itemscope=],[itemid]'))
        elems = elems.add(elem);

    elems.filter('[itemprop]').each(function(){
       var $this = $(this);
       var refItem = $(elem).data('itemref');
       if (refItem) {
           addProp(refItem, this);
       } else {
           var parent = $this.parent().closest('[itemscope],[itemscope=],[itemid]');
           if (parent.length) {
               var item = getItem(parent.get(0));
               addProp(item, this);
           }
       }
    });

    var refElems = (forItemRef && forItemRef.refElems) || [];
    elems.add(elem).filter('[itemref]').each(function(){
        var item = getItem(this);
        var refs = $(this).attr('itemref').split(/\s+/);
        $('#'+refs.join(',#')).each(function() {
            $(this).data('itemref', item);
            refElems.push(elem);
            bindElement(this, false, {itemElems:itemElems, refElems:refElems}, changedOnly);
        });
    });

    elems.filter(':input').each(function(){
        var parent = $(this).parent().closest('[itemscope],[itemscope=],[itemid]');
        if (parent.length) {
            var item = getItem(parent.get(0));
            var binder = Binder.FormBinder.bind(null, item, changedOnly);
            binder.serializeField(this);
        }
    });

    if (forItemRef) {
        return;
    }
    var itemDict = {};
    var items = $.map($.unique(itemElems), function(itemElem) {
        var item = $(itemElem).data('item');
        if (!$(itemElem).data('itemidonly'))
            setAttrProps(itemElem, item);
        if (item[_IDkey]) {
            var existing = itemDict[item[_IDkey]];
            if (existing) {
                //items with same id but appear on multiple elements should be merged
                $.extend(existing, item);
                return null; //don't include
            } else {
                itemDict[item[_IDkey]] = item;
            }
        }
        if ($(itemElem).attr('itemprop') && itemElem != $(elem).get(0))
            return null; //only include top-level items
        else
            return item;
    });

    $(itemElems).removeData('item').removeData('itemidonly');
    $(refElems).removeData('itemref');
    return items;
}

// binder-0.3.js
// Copyright 2008 Steven Bazyl
//
//   Licensed under the Apache License, Version 2.0 (the "License");
//   you may not use this file except in compliance with the License.
//   You may obtain a copy of the License at
//
//       http://www.apache.org/licenses/LICENSE-2.0
//
//   Unless required by applicable law or agreed to in writing, software
//   distributed under the License is distributed on an "AS IS" BASIS,
//   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//   See the License for the specific language governing permissions and
 //  limitations under the License.

var Binder = {};
Binder.Util = {
  isFunction: function( obj ) {
    return obj != undefined
            && typeof(obj) == "function"
            && typeof(obj.constructor) == "function"
            && obj.constructor.prototype.hasOwnProperty( "call" );
  },
  isArray: function( obj ) {
    return obj != undefined && ( obj instanceof Array || obj.construtor == "Array" );
  },
  isString: function( obj ) {
    return typeof(obj) == "string" || obj instanceof String;
  },
  isNumber: function( obj ) {
    return typeof(obj) == "number" || obj instanceof Number;
  },
  isBoolean: function( obj ) {
    return typeof(obj) == "boolean" || obj instanceof Boolean;
  },
  isDate: function( obj ) {
    return obj instanceof Date;
  },
  isBasicType: function( obj ) {
    return this.isString( obj ) || this.isNumber( obj ) || this.isBoolean( obj ) || this.isDate( obj );
  },
  isNumeric: function( obj ) {
    return this.isNumber( obj ) ||  ( this.isString(obj) && !isNaN( Number(obj) ) );
  },
  filter: function( array, callback ) {
    var nv = [];
    for( var i = 0; i < array.length; i++ ) {
      if( callback( array[i] ) ) {
        nv.push( array[i] );
      }
    }
    return nv;
  }
};

Binder.PropertyAccessor =  function( obj ) {
  this.target = obj || {};
  this.index_regexp = /(.*)\[(.*?)\]$/;
};
Binder.PropertyAccessor.prototype = {
  _setProperty: function( obj, path, value ) {
    if( path.length == 0 || obj == undefined) {
      return value;
    }
    var current = path.shift();
    if( current.indexOf( "[" ) >= 0 ) {
      var match = current.match( this.index_regexp );
      var index = match[2];
      current = match[1];
      obj[current] = obj[current] || ( Binder.Util.isNumeric( index ) ? [] : {} );
      if( index ) {
        obj[current][index] = this._setProperty( obj[current][index] || {}, path, value );
      } else {
        var nv = this._setProperty( {}, path, value );
        if( Binder.Util.isArray( nv ) ) {
          obj[current] = nv;
        } else {
          obj[current].push( nv );
        }
      }
    } else {
      obj[current] = this._setProperty( obj[current] || {}, path, value );
    }
    return obj;
  },
  _getProperty: function( obj, path ) {
    if( path.length == 0 || obj == undefined ) {
      return obj;
    }
    var current = path.shift();
    if( current.indexOf( "[" ) >= 0 ) {
      var match = current.match( this.index_regexp );
      current = match[1];
      if( match[2] ) {
        return this._getProperty( obj[current][match[2]], path );
      } else {
        return obj[current];
      }
    } else {
      return this._getProperty( obj[current], path );
    }
  },
  _enumerate: function( collection, obj, path ) {
    if( Binder.Util.isArray( obj ) ) {
      for( var i = 0; i < obj.length; i++ ) {
        this._enumerate( collection, obj[i], path + "["+i+"]" );
      }
    } else if( Binder.Util.isBasicType( obj ) ) {
      collection.push( path );
    } else {
      for( property in obj ) {
        if( !Binder.Util.isFunction( property ) ) {
          this._enumerate( collection, obj[property], path == "" ? property : path + "." + property );
        }
      }
    }
  },
  isIndexed: function( property ) {
    var match = property.match( this.index_regexp );
    //has [] but not [x]
    return match && !match[2];
  },
  set: function(  property, value ) {
    var path = property.split( "." );
    return this._setProperty( this.target, path, value );
  },
  get: function(  property ) {
    var path = property.split( "." );
    return this._getProperty( this.target || {}, path );
  },
  properties: function() {
    var props = [];
    this._enumerate( props, this.target, "" );
    return props;
  }
};
Binder.PropertyAccessor.bindTo = function( obj ) {
  return new Binder.PropertyAccessor( obj );
}

Binder.TypeRegistry = {
  'string': {
    format: function( value ) {
      return String(value);
    },
    parse: function( value ) {
      return value ? value : '';
    },
    empty: function() { return ''; }
  },
  'number': {
    format: function( value ) {
      return String(value);
    },
    parse: function( value ) {
      return Number( value );
    },
    empty: function() { return 0; }
  },
  'boolean': {
    format: function( value ) {
      return String(value);
    },
    parse: function( value ) {
      if( value ) {
        value = value.toLowerCase();
        return "true" == value || "yes" == value || "on" == value;
      }
      return false;
    },
    empty: function() { return false; }
  },
  'json': {
    format: function( value ) {
      return JSON.stringify(value);
    },
    parse: function( value ) {
      return value ? JSON.parse(value) : null;
    },
    empty: function() { return null; }
  },
  'null': { //if a null field is treated as a json or a string but without "null"
    format: function( value ) {
      return '';
    },
    parse: function( value ) {
      if (!value) {
        return null;
      }
      try {
        return JSON.parse(value);
      } catch (e) {
        return value;
      }
    },
    empty: function() { return null; }
  },
  'date': {
    format: function( value ) {
      return value.toString();
    },
    parse: function( value ) {
      return new Date(value).getTime();
    },
    empty: function() { return null; }
  }
};

Binder.FormBinder = function( form, accessor, changedOnly) {
  this.form = form;
  this.accessor = this._getAccessor( accessor );
  this.type_regexp = /type\[(.*)\]/;
  this.changedOnly = changedOnly;
};
Binder.FormBinder.prototype = {
  _isSelected: function( value, options ) {
    if( Binder.Util.isArray( options ) ) {
      for( var i = 0; i < options.length; ++i ) {
        if( value == options[i] ) {
          return true;
        }
      }
    } else if( value != ""  && value != "on" ) {
      return value == options;
    } else {
      return Boolean(options);
    }
  },
  _getType: function( element ) {
    if( element.className ) {
      var m = element.className.match( this.type_regexp );
      if( m && m[1] ) {
        return m[1];
      }
    }
    return "string";
  },
  _format: function( path, value, element ) {
    var type = this._getType( element );
    var handler = Binder.TypeRegistry[type];
    if( Binder.Util.isArray( value ) && handler ) {
      var nv = [];
      for( var i = 0; i < value.length; i++ ) {
        nv[i] = handler.format( value[i] );
      }
      return nv;
    }
    return handler ? handler.format( value ) : String(value);
  },
  _parse: function( path, value, element ) {
    var type = this._getType( element );
    var handler = Binder.TypeRegistry[type];
    if( Binder.Util.isArray( value ) && handler ) {
      var nv = [];
      for( var i = 0; i < value.length; i++ ) {
        nv[i] = handler.parse( value[i] );
      }
      return nv;
    }
    return handler ? handler.parse( value ) : String(value);
  },
  _getEmpty: function(element) {
      var type = this._getType( element );
      var handler = Binder.TypeRegistry[type];
      return handler ? handler.empty() : "";
  },
  _getAccessor: function( obj ) {
    if( obj == undefined ) {
      return this.accessor || new Binder.PropertyAccessor( obj );
    } else if( obj instanceof Binder.PropertyAccessor ) {
      return obj;
    }
    return new Binder.PropertyAccessor( obj );
  },
  //set the obj with form's current values
  serialize: function( obj ) {
    var accessor = this._getAccessor( obj );
    var seen = {};
    for( var i = 0; i < this.form.elements.length; i++) {
      this.serializeField( this.form.elements[i], accessor, seen);
    }
    return accessor.target;
  },
  /* XXX refactor serializeField for readability
  _serializeValueField( element, accessor, seen) {
  },
  _serializeArrayField( element, accessor, seen) {
    //don't apply
  },
  serializeField: function( element, obj, seen) {
    if (!element.name || (element.className && element.className.match(/excludefield/)))
        return; //skip unnamed fields
    var accessor = this._getAccessor( obj );
    var isArray = accessor.isIndexed( element.name );
    if (isArray) {
      return this._serializeArrayField( element, accessor, seen);
    } else {
      return this._serializeValueField( element, accessor, seen);
    }
  },
  */
  //read value out of form field and set the property's value
  serializeField: function( element, obj, seen) {
    if (!element.name || (element.className && element.className.match(/excludefield/)))
        return; //skip unnamed fields
    var accessor = this._getAccessor( obj );
    var value = undefined;
    if( element.type == "radio" || element.type == "checkbox" )  {
      //if property is not an array (!isIndexed):
      //  if the element is checked set the value
      //  if no elements are checked, set to "empty"
      //if it is an array, start with an empty array
      //and push the value of each checked element
      var isArray = accessor.isIndexed( element.name );
      var changedOnly = this.changedOnly && !element.hasAttribute('data-always');
      if (changedOnly && (!seen || !isArray)) {
        if ((element.checked && element.defaultChecked) || (!element.checked && !element.defaultChecked)) {
          return; //unchanged
        }
      }
      if (!changedOnly && seen && !seen[element.name]) {
        seen[element.name] = true;
        accessor.set( element.name, isArray ? [] : this._getEmpty(element));
      }
      if( element.value != "" && element.value != "on" ) {
        value = this._parse( element.name, element.value, element );
      } else {
        value = element.checked;
      }
      if (element.checked) {
        accessor.set( element.name, value ); //will value push if property isIndexed()
      } else if (changedOnly || !seen) {
        // stateless call and not checked: remove this value from obj's array
        var values = accessor.get( element.name );
        if (isArray) {
          values = Binder.Util.filter( values, function( item) { return item != value; } );
          accessor.set( element.name, values );
        } else {
          accessor.set( element.name, this._getEmpty(element));
        }
      }
    } else if ( element.type == "select-one" || element.type == "select-multiple" ) {
      if (this.changedOnly && !element.hasAttribute('data-always')) {
        var changed = false;
        for( var j = 0; j < element.options.length; j++ ) {
          var option = element.options[j];
          changed = (option.selected && !option.defaultSelected) || (!option.selected && option.defaultSelected);
          if (changed) {
            break;
          }
        }
        if (!changed) {
          return;
        }
      }
      accessor.set( element.name, accessor.isIndexed( element.name ) ? [] : undefined );
      for( var j = 0; j < element.options.length; j++ ) {
        var option = element.options[j];
        //if option specifies a type use that, otherwise use the select element
        var typeElement = option.className && option.className.match( this.type_regexp ) ? option : element;
        var v = this._parse( element.name, option.value, typeElement );
        if( option.selected ) {
          accessor.set( element.name, v );
        }
      }
    } else if ( element.type != 'file') {
        if (this.changedOnly && element.type !== 'hidden'
              && !element.hasAttribute('data-always')
              && element.defaultValue === element.value) {
          return;
        }
        var tz = element.value && element.getAttribute('data-tz');
        // add tz offset to value (assumes iso format) so date will parse to utc
        // XXX support daylight savings time by using tz name instead of offset
        var elementValue = element.value + (tz || '');
        value = this._parse( element.name, elementValue, element );
        if( accessor.isIndexed(element.name) ) {
          var current = accessor.get( element.name ) ||  [];
          current.push(value);
          value = current;
        }
        accessor.set( element.name, value );
    }
    return accessor.target;
  },

  //update the form with the object
  deserialize: function( obj ) { //set form html
    var accessor = this._getAccessor( obj );
    for( var i = 0; i < this.form.elements.length; i++) {
      this.deserializeField( this.form.elements[i], accessor );
    }
    return accessor.target;
  },

  //update the form field with the property value
  deserializeField: function( element, obj ) {
    var accessor = this._getAccessor( obj );
    var value = accessor.get( element.name || '');
    value = this._format( element.name, value, element );
    if( element.type == "radio" || element.type == "checkbox" )  {
      element.checked = this._isSelected( element.value, value );
    } else if ( element.type == "select-one" || element.type == "select-multiple" ) {
      for( var j = 0; j < element.options.length; j++ ) {
        element.options[j].selected = this._isSelected( element.options[j].value, value );
      }
    } else {
      element.value = value || "";
      // reset defaultValue if we only want to serialize changed fields
      if (this.changedOnly) {
        element.defaultValue = value;
      }
    }
  }
};

Binder.FormBinder.bind = function( form, obj, changedOnly) {
  return new Binder.FormBinder( form, obj, changedOnly);
};
