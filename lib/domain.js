// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var util = require('util');
var events = require('events');
var EventEmitter = events.EventEmitter;
var inherits = util.inherits;

// communicate with events module, but don't require that
// module to have to load this one, since this module has
// a few side effects.
events.usingDomains = true;

exports.Domain = Domain;

exports.create = exports.createDomain = function(cb) {
  return new Domain(cb);
};

// it's possible to enter one domain while already inside
// another one.  the stack is each entered domain.
exports.stack = [];
// the active domain is always the one that we're currently in.
exports.active = null;


// loading this file the first time sets up the global
// uncaughtException handler.
process.on('uncaughtException', uncaughtHandler);

function uncaughtHandler(er) {
  // if there's an active domain, then handle this there.
  // Note that if this error emission throws, then it'll just crash.
  if (exports.active) {
    decorate(er, { domain: exports.active,
                   domain_thrown: true });
    exports.active.emit('error', er);
  } else if (process.listeners('uncaughtException').length === 1) {
    // if there are other handlers, then they'll take care of it.
    // but if not, then we need to crash now.
    throw er;
  }
}

inherits(Domain, EventEmitter);

function Domain(cb) {
  EventEmitter.apply(this);

  if (cb && typeof cb === 'function') {
    cb = this.bind(cb);
    cb();
  }
}

Domain.prototype.enter = function() {
  if (exports.active !== this) {
    exports.active = this;
    exports.stack.push(this);
  }
};

Domain.prototype.exit = function() {
  // exit all domains until this one.
  var d;
  do {
    d = exports.stack.pop();
  } while (d && d !== this);

  exports.active = exports.stack[ exports.stack.length - 1 ];
};

Domain.prototype.add = function(ee) {
  ee._domain = this;
};

Domain.prototype.bind = function(cb) {
  // if cb throws, catch it here.
  // if cb is called with an error arg, hijack it.
  var self = this;
  return function(er) {
    if (er && er instanceof Error) {
      decorate(er, { domain_bound: cb,
                     domain_thrown: false,
                     domain: self });
      self.emit('error', er);
      return;
    }
    self.enter();
    var ret = cb.apply(this, arguments);
    self.exit();
    return ret;
  };
};

function decorate(er, props) {
  Object.keys(props).forEach(function(k, _, __) {
    if (er.hasOwnProperty(k)) return;
    er[k] = props[k];
  });
}