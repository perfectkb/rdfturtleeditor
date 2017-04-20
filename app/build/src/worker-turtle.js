"no use strict";
;(function(window) {
if (typeof window.window != "undefined" && window.document)
    return;
if (window.require && window.define)
    return;

if (!window.console) {
    window.console = function() {
        var msgs = Array.prototype.slice.call(arguments, 0);
        postMessage({type: "log", data: msgs});
    };
    window.console.error =
    window.console.warn = 
    window.console.log =
    window.console.trace = window.console;
}
window.window = window;
window.ace = window;

window.onerror = function(message, file, line, col, err) {
    postMessage({type: "error", data: {
        message: message,
        data: err.data,
        file: file,
        line: line, 
        col: col,
        stack: err.stack
    }});
};

window.normalizeModule = function(parentId, moduleName) {
    // normalize plugin requires
    if (moduleName.indexOf("!") !== -1) {
        var chunks = moduleName.split("!");
        return window.normalizeModule(parentId, chunks[0]) + "!" + window.normalizeModule(parentId, chunks[1]);
    }
    // normalize relative requires
    if (moduleName.charAt(0) == ".") {
        var base = parentId.split("/").slice(0, -1).join("/");
        moduleName = (base ? base + "/" : "") + moduleName;
        
        while (moduleName.indexOf(".") !== -1 && previous != moduleName) {
            var previous = moduleName;
            moduleName = moduleName.replace(/^\.\//, "").replace(/\/\.\//, "/").replace(/[^\/]+\/\.\.\//, "");
        }
    }
    
    return moduleName;
};

window.require = function require(parentId, id) {
    if (!id) {
        id = parentId;
        parentId = null;
    }
    if (!id.charAt)
        throw new Error("worker.js require() accepts only (parentId, id) as arguments");

    id = window.normalizeModule(parentId, id);

    var module = window.require.modules[id];
    if (module) {
        if (!module.initialized) {
            module.initialized = true;
            module.exports = module.factory().exports;
        }
        return module.exports;
    }
   
    if (!window.require.tlns)
        return console.log("unable to load " + id);
    
    var path = resolveModuleId(id, window.require.tlns);
    if (path.slice(-3) != ".js") path += ".js";
    
    window.require.id = id;
    window.require.modules[id] = {}; // prevent infinite loop on broken modules
    importScripts(path);
    return window.require(parentId, id);
};
function resolveModuleId(id, paths) {
    var testPath = id, tail = "";
    while (testPath) {
        var alias = paths[testPath];
        if (typeof alias == "string") {
            return alias + tail;
        } else if (alias) {
            return  alias.location.replace(/\/*$/, "/") + (tail || alias.main || alias.name);
        } else if (alias === false) {
            return "";
        }
        var i = testPath.lastIndexOf("/");
        if (i === -1) break;
        tail = testPath.substr(i) + tail;
        testPath = testPath.slice(0, i);
    }
    return id;
}
window.require.modules = {};
window.require.tlns = {};

window.define = function(id, deps, factory) {
    if (arguments.length == 2) {
        factory = deps;
        if (typeof id != "string") {
            deps = id;
            id = window.require.id;
        }
    } else if (arguments.length == 1) {
        factory = id;
        deps = [];
        id = window.require.id;
    }
    
    if (typeof factory != "function") {
        window.require.modules[id] = {
            exports: factory,
            initialized: true
        };
        return;
    }

    if (!deps.length)
        // If there is no dependencies, we inject "require", "exports" and
        // "module" as dependencies, to provide CommonJS compatibility.
        deps = ["require", "exports", "module"];

    var req = function(childId) {
        return window.require(id, childId);
    };

    window.require.modules[id] = {
        exports: {},
        factory: function() {
            var module = this;
            var returnExports = factory.apply(this, deps.map(function(dep) {
                switch (dep) {
                    // Because "require", "exports" and "module" aren't actual
                    // dependencies, we must handle them seperately.
                    case "require": return req;
                    case "exports": return module.exports;
                    case "module":  return module;
                    // But for all other dependencies, we can just go ahead and
                    // require them.
                    default:        return req(dep);
                }
            }));
            if (returnExports)
                module.exports = returnExports;
            return module;
        }
    };
};
window.define.amd = {};
require.tlns = {};
window.initBaseUrls  = function initBaseUrls(topLevelNamespaces) {
    for (var i in topLevelNamespaces)
        require.tlns[i] = topLevelNamespaces[i];
};

window.initSender = function initSender() {

    var EventEmitter = window.require("ace/lib/event_emitter").EventEmitter;
    var oop = window.require("ace/lib/oop");
    
    var Sender = function() {};
    
    (function() {
        
        oop.implement(this, EventEmitter);
                
        this.callback = function(data, callbackId) {
            postMessage({
                type: "call",
                id: callbackId,
                data: data
            });
        };
    
        this.emit = function(name, data) {
            postMessage({
                type: "event",
                name: name,
                data: data
            });
        };
        
    }).call(Sender.prototype);
    
    return new Sender();
};

var main = window.main = null;
var sender = window.sender = null;

window.onmessage = function(e) {
    var msg = e.data;
    if (msg.event && sender) {
        sender._signal(msg.event, msg.data);
    }
    else if (msg.command) {
        if (main[msg.command])
            main[msg.command].apply(main, msg.args);
        else if (window[msg.command])
            window[msg.command].apply(window, msg.args);
        else
            throw new Error("Unknown command:" + msg.command);
    }
    else if (msg.init) {
        window.initBaseUrls(msg.tlns);
        require("ace/lib/es5-shim");
        sender = window.sender = window.initSender();
        var clazz = require(msg.module)[msg.classname];
        main = window.main = new clazz(sender);
    }
};
})(this);

define("ace/lib/oop",["require","exports","module"], function(require, exports, module) {
"use strict";

exports.inherits = function(ctor, superCtor) {
    ctor.super_ = superCtor;
    ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
            value: ctor,
            enumerable: false,
            writable: true,
            configurable: true
        }
    });
};

exports.mixin = function(obj, mixin) {
    for (var key in mixin) {
        obj[key] = mixin[key];
    }
    return obj;
};

exports.implement = function(proto, mixin) {
    exports.mixin(proto, mixin);
};

});

define("ace/range",["require","exports","module"], function(require, exports, module) {
"use strict";
var comparePoints = function(p1, p2) {
    return p1.row - p2.row || p1.column - p2.column;
};
var Range = function(startRow, startColumn, endRow, endColumn) {
    this.start = {
        row: startRow,
        column: startColumn
    };

    this.end = {
        row: endRow,
        column: endColumn
    };
};

(function() {
    this.isEqual = function(range) {
        return this.start.row === range.start.row &&
            this.end.row === range.end.row &&
            this.start.column === range.start.column &&
            this.end.column === range.end.column;
    };
    this.toString = function() {
        return ("Range: [" + this.start.row + "/" + this.start.column +
            "] -> [" + this.end.row + "/" + this.end.column + "]");
    };

    this.contains = function(row, column) {
        return this.compare(row, column) == 0;
    };
    this.compareRange = function(range) {
        var cmp,
            end = range.end,
            start = range.start;

        cmp = this.compare(end.row, end.column);
        if (cmp == 1) {
            cmp = this.compare(start.row, start.column);
            if (cmp == 1) {
                return 2;
            } else if (cmp == 0) {
                return 1;
            } else {
                return 0;
            }
        } else if (cmp == -1) {
            return -2;
        } else {
            cmp = this.compare(start.row, start.column);
            if (cmp == -1) {
                return -1;
            } else if (cmp == 1) {
                return 42;
            } else {
                return 0;
            }
        }
    };
    this.comparePoint = function(p) {
        return this.compare(p.row, p.column);
    };
    this.containsRange = function(range) {
        return this.comparePoint(range.start) == 0 && this.comparePoint(range.end) == 0;
    };
    this.intersects = function(range) {
        var cmp = this.compareRange(range);
        return (cmp == -1 || cmp == 0 || cmp == 1);
    };
    this.isEnd = function(row, column) {
        return this.end.row == row && this.end.column == column;
    };
    this.isStart = function(row, column) {
        return this.start.row == row && this.start.column == column;
    };
    this.setStart = function(row, column) {
        if (typeof row == "object") {
            this.start.column = row.column;
            this.start.row = row.row;
        } else {
            this.start.row = row;
            this.start.column = column;
        }
    };
    this.setEnd = function(row, column) {
        if (typeof row == "object") {
            this.end.column = row.column;
            this.end.row = row.row;
        } else {
            this.end.row = row;
            this.end.column = column;
        }
    };
    this.inside = function(row, column) {
        if (this.compare(row, column) == 0) {
            if (this.isEnd(row, column) || this.isStart(row, column)) {
                return false;
            } else {
                return true;
            }
        }
        return false;
    };
    this.insideStart = function(row, column) {
        if (this.compare(row, column) == 0) {
            if (this.isEnd(row, column)) {
                return false;
            } else {
                return true;
            }
        }
        return false;
    };
    this.insideEnd = function(row, column) {
        if (this.compare(row, column) == 0) {
            if (this.isStart(row, column)) {
                return false;
            } else {
                return true;
            }
        }
        return false;
    };
    this.compare = function(row, column) {
        if (!this.isMultiLine()) {
            if (row === this.start.row) {
                return column < this.start.column ? -1 : (column > this.end.column ? 1 : 0);
            }
        }

        if (row < this.start.row)
            return -1;

        if (row > this.end.row)
            return 1;

        if (this.start.row === row)
            return column >= this.start.column ? 0 : -1;

        if (this.end.row === row)
            return column <= this.end.column ? 0 : 1;

        return 0;
    };
    this.compareStart = function(row, column) {
        if (this.start.row == row && this.start.column == column) {
            return -1;
        } else {
            return this.compare(row, column);
        }
    };
    this.compareEnd = function(row, column) {
        if (this.end.row == row && this.end.column == column) {
            return 1;
        } else {
            return this.compare(row, column);
        }
    };
    this.compareInside = function(row, column) {
        if (this.end.row == row && this.end.column == column) {
            return 1;
        } else if (this.start.row == row && this.start.column == column) {
            return -1;
        } else {
            return this.compare(row, column);
        }
    };
    this.clipRows = function(firstRow, lastRow) {
        if (this.end.row > lastRow)
            var end = {row: lastRow + 1, column: 0};
        else if (this.end.row < firstRow)
            var end = {row: firstRow, column: 0};

        if (this.start.row > lastRow)
            var start = {row: lastRow + 1, column: 0};
        else if (this.start.row < firstRow)
            var start = {row: firstRow, column: 0};

        return Range.fromPoints(start || this.start, end || this.end);
    };
    this.extend = function(row, column) {
        var cmp = this.compare(row, column);

        if (cmp == 0)
            return this;
        else if (cmp == -1)
            var start = {row: row, column: column};
        else
            var end = {row: row, column: column};

        return Range.fromPoints(start || this.start, end || this.end);
    };

    this.isEmpty = function() {
        return (this.start.row === this.end.row && this.start.column === this.end.column);
    };
    this.isMultiLine = function() {
        return (this.start.row !== this.end.row);
    };
    this.clone = function() {
        return Range.fromPoints(this.start, this.end);
    };
    this.collapseRows = function() {
        if (this.end.column == 0)
            return new Range(this.start.row, 0, Math.max(this.start.row, this.end.row-1), 0)
        else
            return new Range(this.start.row, 0, this.end.row, 0)
    };
    this.toScreenRange = function(session) {
        var screenPosStart = session.documentToScreenPosition(this.start);
        var screenPosEnd = session.documentToScreenPosition(this.end);

        return new Range(
            screenPosStart.row, screenPosStart.column,
            screenPosEnd.row, screenPosEnd.column
        );
    };
    this.moveBy = function(row, column) {
        this.start.row += row;
        this.start.column += column;
        this.end.row += row;
        this.end.column += column;
    };

}).call(Range.prototype);
Range.fromPoints = function(start, end) {
    return new Range(start.row, start.column, end.row, end.column);
};
Range.comparePoints = comparePoints;

Range.comparePoints = function(p1, p2) {
    return p1.row - p2.row || p1.column - p2.column;
};


exports.Range = Range;
});

define("ace/apply_delta",["require","exports","module"], function(require, exports, module) {
"use strict";

function throwDeltaError(delta, errorText){
    console.log("Invalid Delta:", delta);
    throw "Invalid Delta: " + errorText;
}

function positionInDocument(docLines, position) {
    return position.row    >= 0 && position.row    <  docLines.length &&
           position.column >= 0 && position.column <= docLines[position.row].length;
}

function validateDelta(docLines, delta) {
    if (delta.action != "insert" && delta.action != "remove")
        throwDeltaError(delta, "delta.action must be 'insert' or 'remove'");
    if (!(delta.lines instanceof Array))
        throwDeltaError(delta, "delta.lines must be an Array");
    if (!delta.start || !delta.end)
       throwDeltaError(delta, "delta.start/end must be an present");
    var start = delta.start;
    if (!positionInDocument(docLines, delta.start))
        throwDeltaError(delta, "delta.start must be contained in document");
    var end = delta.end;
    if (delta.action == "remove" && !positionInDocument(docLines, end))
        throwDeltaError(delta, "delta.end must contained in document for 'remove' actions");
    var numRangeRows = end.row - start.row;
    var numRangeLastLineChars = (end.column - (numRangeRows == 0 ? start.column : 0));
    if (numRangeRows != delta.lines.length - 1 || delta.lines[numRangeRows].length != numRangeLastLineChars)
        throwDeltaError(delta, "delta.range must match delta lines");
}

exports.applyDelta = function(docLines, delta, doNotValidate) {
    
    var row = delta.start.row;
    var startColumn = delta.start.column;
    var line = docLines[row] || "";
    switch (delta.action) {
        case "insert":
            var lines = delta.lines;
            if (lines.length === 1) {
                docLines[row] = line.substring(0, startColumn) + delta.lines[0] + line.substring(startColumn);
            } else {
                var args = [row, 1].concat(delta.lines);
                docLines.splice.apply(docLines, args);
                docLines[row] = line.substring(0, startColumn) + docLines[row];
                docLines[row + delta.lines.length - 1] += line.substring(startColumn);
            }
            break;
        case "remove":
            var endColumn = delta.end.column;
            var endRow = delta.end.row;
            if (row === endRow) {
                docLines[row] = line.substring(0, startColumn) + line.substring(endColumn);
            } else {
                docLines.splice(
                    row, endRow - row + 1,
                    line.substring(0, startColumn) + docLines[endRow].substring(endColumn)
                );
            }
            break;
    }
}
});

define("ace/lib/event_emitter",["require","exports","module"], function(require, exports, module) {
"use strict";

var EventEmitter = {};
var stopPropagation = function() { this.propagationStopped = true; };
var preventDefault = function() { this.defaultPrevented = true; };

EventEmitter._emit =
EventEmitter._dispatchEvent = function(eventName, e) {
    this._eventRegistry || (this._eventRegistry = {});
    this._defaultHandlers || (this._defaultHandlers = {});

    var listeners = this._eventRegistry[eventName] || [];
    var defaultHandler = this._defaultHandlers[eventName];
    if (!listeners.length && !defaultHandler)
        return;

    if (typeof e != "object" || !e)
        e = {};

    if (!e.type)
        e.type = eventName;
    if (!e.stopPropagation)
        e.stopPropagation = stopPropagation;
    if (!e.preventDefault)
        e.preventDefault = preventDefault;

    listeners = listeners.slice();
    for (var i=0; i<listeners.length; i++) {
        listeners[i](e, this);
        if (e.propagationStopped)
            break;
    }
    
    if (defaultHandler && !e.defaultPrevented)
        return defaultHandler(e, this);
};


EventEmitter._signal = function(eventName, e) {
    var listeners = (this._eventRegistry || {})[eventName];
    if (!listeners)
        return;
    listeners = listeners.slice();
    for (var i=0; i<listeners.length; i++)
        listeners[i](e, this);
};

EventEmitter.once = function(eventName, callback) {
    var _self = this;
    callback && this.addEventListener(eventName, function newCallback() {
        _self.removeEventListener(eventName, newCallback);
        callback.apply(null, arguments);
    });
};


EventEmitter.setDefaultHandler = function(eventName, callback) {
    var handlers = this._defaultHandlers
    if (!handlers)
        handlers = this._defaultHandlers = {_disabled_: {}};
    
    if (handlers[eventName]) {
        var old = handlers[eventName];
        var disabled = handlers._disabled_[eventName];
        if (!disabled)
            handlers._disabled_[eventName] = disabled = [];
        disabled.push(old);
        var i = disabled.indexOf(callback);
        if (i != -1) 
            disabled.splice(i, 1);
    }
    handlers[eventName] = callback;
};
EventEmitter.removeDefaultHandler = function(eventName, callback) {
    var handlers = this._defaultHandlers
    if (!handlers)
        return;
    var disabled = handlers._disabled_[eventName];
    
    if (handlers[eventName] == callback) {
        var old = handlers[eventName];
        if (disabled)
            this.setDefaultHandler(eventName, disabled.pop());
    } else if (disabled) {
        var i = disabled.indexOf(callback);
        if (i != -1)
            disabled.splice(i, 1);
    }
};

EventEmitter.on =
EventEmitter.addEventListener = function(eventName, callback, capturing) {
    this._eventRegistry = this._eventRegistry || {};

    var listeners = this._eventRegistry[eventName];
    if (!listeners)
        listeners = this._eventRegistry[eventName] = [];

    if (listeners.indexOf(callback) == -1)
        listeners[capturing ? "unshift" : "push"](callback);
    return callback;
};

EventEmitter.off =
EventEmitter.removeListener =
EventEmitter.removeEventListener = function(eventName, callback) {
    this._eventRegistry = this._eventRegistry || {};

    var listeners = this._eventRegistry[eventName];
    if (!listeners)
        return;

    var index = listeners.indexOf(callback);
    if (index !== -1)
        listeners.splice(index, 1);
};

EventEmitter.removeAllListeners = function(eventName) {
    if (this._eventRegistry) this._eventRegistry[eventName] = [];
};

exports.EventEmitter = EventEmitter;

});

define("ace/anchor",["require","exports","module","ace/lib/oop","ace/lib/event_emitter"], function(require, exports, module) {
"use strict";

var oop = require("./lib/oop");
var EventEmitter = require("./lib/event_emitter").EventEmitter;

var Anchor = exports.Anchor = function(doc, row, column) {
    this.$onChange = this.onChange.bind(this);
    this.attach(doc);
    
    if (typeof column == "undefined")
        this.setPosition(row.row, row.column);
    else
        this.setPosition(row, column);
};

(function() {

    oop.implement(this, EventEmitter);
    this.getPosition = function() {
        return this.$clipPositionToDocument(this.row, this.column);
    };
    this.getDocument = function() {
        return this.document;
    };
    this.$insertRight = false;
    this.onChange = function(delta) {
        if (delta.start.row == delta.end.row && delta.start.row != this.row)
            return;

        if (delta.start.row > this.row)
            return;
            
        var point = $getTransformedPoint(delta, {row: this.row, column: this.column}, this.$insertRight);
        this.setPosition(point.row, point.column, true);
    };
    
    function $pointsInOrder(point1, point2, equalPointsInOrder) {
        var bColIsAfter = equalPointsInOrder ? point1.column <= point2.column : point1.column < point2.column;
        return (point1.row < point2.row) || (point1.row == point2.row && bColIsAfter);
    }
            
    function $getTransformedPoint(delta, point, moveIfEqual) {
        var deltaIsInsert = delta.action == "insert";
        var deltaRowShift = (deltaIsInsert ? 1 : -1) * (delta.end.row    - delta.start.row);
        var deltaColShift = (deltaIsInsert ? 1 : -1) * (delta.end.column - delta.start.column);
        var deltaStart = delta.start;
        var deltaEnd = deltaIsInsert ? deltaStart : delta.end; // Collapse insert range.
        if ($pointsInOrder(point, deltaStart, moveIfEqual)) {
            return {
                row: point.row,
                column: point.column
            };
        }
        if ($pointsInOrder(deltaEnd, point, !moveIfEqual)) {
            return {
                row: point.row + deltaRowShift,
                column: point.column + (point.row == deltaEnd.row ? deltaColShift : 0)
            };
        }
        
        return {
            row: deltaStart.row,
            column: deltaStart.column
        };
    }
    this.setPosition = function(row, column, noClip) {
        var pos;
        if (noClip) {
            pos = {
                row: row,
                column: column
            };
        } else {
            pos = this.$clipPositionToDocument(row, column);
        }

        if (this.row == pos.row && this.column == pos.column)
            return;

        var old = {
            row: this.row,
            column: this.column
        };

        this.row = pos.row;
        this.column = pos.column;
        this._signal("change", {
            old: old,
            value: pos
        });
    };
    this.detach = function() {
        this.document.removeEventListener("change", this.$onChange);
    };
    this.attach = function(doc) {
        this.document = doc || this.document;
        this.document.on("change", this.$onChange);
    };
    this.$clipPositionToDocument = function(row, column) {
        var pos = {};

        if (row >= this.document.getLength()) {
            pos.row = Math.max(0, this.document.getLength() - 1);
            pos.column = this.document.getLine(pos.row).length;
        }
        else if (row < 0) {
            pos.row = 0;
            pos.column = 0;
        }
        else {
            pos.row = row;
            pos.column = Math.min(this.document.getLine(pos.row).length, Math.max(0, column));
        }

        if (column < 0)
            pos.column = 0;

        return pos;
    };

}).call(Anchor.prototype);

});

define("ace/document",["require","exports","module","ace/lib/oop","ace/apply_delta","ace/lib/event_emitter","ace/range","ace/anchor"], function(require, exports, module) {
"use strict";

var oop = require("./lib/oop");
var applyDelta = require("./apply_delta").applyDelta;
var EventEmitter = require("./lib/event_emitter").EventEmitter;
var Range = require("./range").Range;
var Anchor = require("./anchor").Anchor;

var Document = function(textOrLines) {
    this.$lines = [""];
    if (textOrLines.length === 0) {
        this.$lines = [""];
    } else if (Array.isArray(textOrLines)) {
        this.insertMergedLines({row: 0, column: 0}, textOrLines);
    } else {
        this.insert({row: 0, column:0}, textOrLines);
    }
};

(function() {

    oop.implement(this, EventEmitter);
    this.setValue = function(text) {
        var len = this.getLength() - 1;
        this.remove(new Range(0, 0, len, this.getLine(len).length));
        this.insert({row: 0, column: 0}, text);
    };
    this.getValue = function() {
        return this.getAllLines().join(this.getNewLineCharacter());
    };
    this.createAnchor = function(row, column) {
        return new Anchor(this, row, column);
    };
    if ("aaa".split(/a/).length === 0) {
        this.$split = function(text) {
            return text.replace(/\r\n|\r/g, "\n").split("\n");
        };
    } else {
        this.$split = function(text) {
            return text.split(/\r\n|\r|\n/);
        };
    }


    this.$detectNewLine = function(text) {
        var match = text.match(/^.*?(\r\n|\r|\n)/m);
        this.$autoNewLine = match ? match[1] : "\n";
        this._signal("changeNewLineMode");
    };
    this.getNewLineCharacter = function() {
        switch (this.$newLineMode) {
          case "windows":
            return "\r\n";
          case "unix":
            return "\n";
          default:
            return this.$autoNewLine || "\n";
        }
    };

    this.$autoNewLine = "";
    this.$newLineMode = "auto";
    this.setNewLineMode = function(newLineMode) {
        if (this.$newLineMode === newLineMode)
            return;

        this.$newLineMode = newLineMode;
        this._signal("changeNewLineMode");
    };
    this.getNewLineMode = function() {
        return this.$newLineMode;
    };
    this.isNewLine = function(text) {
        return (text == "\r\n" || text == "\r" || text == "\n");
    };
    this.getLine = function(row) {
        return this.$lines[row] || "";
    };
    this.getLines = function(firstRow, lastRow) {
        return this.$lines.slice(firstRow, lastRow + 1);
    };
    this.getAllLines = function() {
        return this.getLines(0, this.getLength());
    };
    this.getLength = function() {
        return this.$lines.length;
    };
    this.getTextRange = function(range) {
        return this.getLinesForRange(range).join(this.getNewLineCharacter());
    };
    this.getLinesForRange = function(range) {
        var lines;
        if (range.start.row === range.end.row) {
            lines = [this.getLine(range.start.row).substring(range.start.column, range.end.column)];
        } else {
            lines = this.getLines(range.start.row, range.end.row);
            lines[0] = (lines[0] || "").substring(range.start.column);
            var l = lines.length - 1;
            if (range.end.row - range.start.row == l)
                lines[l] = lines[l].substring(0, range.end.column);
        }
        return lines;
    };
    this.insertLines = function(row, lines) {
        console.warn("Use of document.insertLines is deprecated. Use the insertFullLines method instead.");
        return this.insertFullLines(row, lines);
    };
    this.removeLines = function(firstRow, lastRow) {
        console.warn("Use of document.removeLines is deprecated. Use the removeFullLines method instead.");
        return this.removeFullLines(firstRow, lastRow);
    };
    this.insertNewLine = function(position) {
        console.warn("Use of document.insertNewLine is deprecated. Use insertMergedLines(position, ['', '']) instead.");
        return this.insertMergedLines(position, ["", ""]);
    };
    this.insert = function(position, text) {
        if (this.getLength() <= 1)
            this.$detectNewLine(text);
        
        return this.insertMergedLines(position, this.$split(text));
    };
    this.insertInLine = function(position, text) {
        var start = this.clippedPos(position.row, position.column);
        var end = this.pos(position.row, position.column + text.length);
        
        this.applyDelta({
            start: start,
            end: end,
            action: "insert",
            lines: [text]
        }, true);
        
        return this.clonePos(end);
    };
    
    this.clippedPos = function(row, column) {
        var length = this.getLength();
        if (row === undefined) {
            row = length;
        } else if (row < 0) {
            row = 0;
        } else if (row >= length) {
            row = length - 1;
            column = undefined;
        }
        var line = this.getLine(row);
        if (column == undefined)
            column = line.length;
        column = Math.min(Math.max(column, 0), line.length);
        return {row: row, column: column};
    };
    
    this.clonePos = function(pos) {
        return {row: pos.row, column: pos.column};
    };
    
    this.pos = function(row, column) {
        return {row: row, column: column};
    };
    
    this.$clipPosition = function(position) {
        var length = this.getLength();
        if (position.row >= length) {
            position.row = Math.max(0, length - 1);
            position.column = this.getLine(length - 1).length;
        } else {
            position.row = Math.max(0, position.row);
            position.column = Math.min(Math.max(position.column, 0), this.getLine(position.row).length);
        }
        return position;
    };
    this.insertFullLines = function(row, lines) {
        row = Math.min(Math.max(row, 0), this.getLength());
        var column = 0;
        if (row < this.getLength()) {
            lines = lines.concat([""]);
            column = 0;
        } else {
            lines = [""].concat(lines);
            row--;
            column = this.$lines[row].length;
        }
        this.insertMergedLines({row: row, column: column}, lines);
    };    
    this.insertMergedLines = function(position, lines) {
        var start = this.clippedPos(position.row, position.column);
        var end = {
            row: start.row + lines.length - 1,
            column: (lines.length == 1 ? start.column : 0) + lines[lines.length - 1].length
        };
        
        this.applyDelta({
            start: start,
            end: end,
            action: "insert",
            lines: lines
        });
        
        return this.clonePos(end);
    };
    this.remove = function(range) {
        var start = this.clippedPos(range.start.row, range.start.column);
        var end = this.clippedPos(range.end.row, range.end.column);
        this.applyDelta({
            start: start,
            end: end,
            action: "remove",
            lines: this.getLinesForRange({start: start, end: end})
        });
        return this.clonePos(start);
    };
    this.removeInLine = function(row, startColumn, endColumn) {
        var start = this.clippedPos(row, startColumn);
        var end = this.clippedPos(row, endColumn);
        
        this.applyDelta({
            start: start,
            end: end,
            action: "remove",
            lines: this.getLinesForRange({start: start, end: end})
        }, true);
        
        return this.clonePos(start);
    };
    this.removeFullLines = function(firstRow, lastRow) {
        firstRow = Math.min(Math.max(0, firstRow), this.getLength() - 1);
        lastRow  = Math.min(Math.max(0, lastRow ), this.getLength() - 1);
        var deleteFirstNewLine = lastRow == this.getLength() - 1 && firstRow > 0;
        var deleteLastNewLine  = lastRow  < this.getLength() - 1;
        var startRow = ( deleteFirstNewLine ? firstRow - 1                  : firstRow                    );
        var startCol = ( deleteFirstNewLine ? this.getLine(startRow).length : 0                           );
        var endRow   = ( deleteLastNewLine  ? lastRow + 1                   : lastRow                     );
        var endCol   = ( deleteLastNewLine  ? 0                             : this.getLine(endRow).length ); 
        var range = new Range(startRow, startCol, endRow, endCol);
        var deletedLines = this.$lines.slice(firstRow, lastRow + 1);
        
        this.applyDelta({
            start: range.start,
            end: range.end,
            action: "remove",
            lines: this.getLinesForRange(range)
        });
        return deletedLines;
    };
    this.removeNewLine = function(row) {
        if (row < this.getLength() - 1 && row >= 0) {
            this.applyDelta({
                start: this.pos(row, this.getLine(row).length),
                end: this.pos(row + 1, 0),
                action: "remove",
                lines: ["", ""]
            });
        }
    };
    this.replace = function(range, text) {
        if (!(range instanceof Range))
            range = Range.fromPoints(range.start, range.end);
        if (text.length === 0 && range.isEmpty())
            return range.start;
        if (text == this.getTextRange(range))
            return range.end;

        this.remove(range);
        var end;
        if (text) {
            end = this.insert(range.start, text);
        }
        else {
            end = range.start;
        }
        
        return end;
    };
    this.applyDeltas = function(deltas) {
        for (var i=0; i<deltas.length; i++) {
            this.applyDelta(deltas[i]);
        }
    };
    this.revertDeltas = function(deltas) {
        for (var i=deltas.length-1; i>=0; i--) {
            this.revertDelta(deltas[i]);
        }
    };
    this.applyDelta = function(delta, doNotValidate) {
        var isInsert = delta.action == "insert";
        if (isInsert ? delta.lines.length <= 1 && !delta.lines[0]
            : !Range.comparePoints(delta.start, delta.end)) {
            return;
        }
        
        if (isInsert && delta.lines.length > 20000)
            this.$splitAndapplyLargeDelta(delta, 20000);
        applyDelta(this.$lines, delta, doNotValidate);
        this._signal("change", delta);
    };
    
    this.$splitAndapplyLargeDelta = function(delta, MAX) {
        var lines = delta.lines;
        var l = lines.length;
        var row = delta.start.row; 
        var column = delta.start.column;
        var from = 0, to = 0;
        do {
            from = to;
            to += MAX - 1;
            var chunk = lines.slice(from, to);
            if (to > l) {
                delta.lines = chunk;
                delta.start.row = row + from;
                delta.start.column = column;
                break;
            }
            chunk.push("");
            this.applyDelta({
                start: this.pos(row + from, column),
                end: this.pos(row + to, column = 0),
                action: delta.action,
                lines: chunk
            }, true);
        } while(true);
    };
    this.revertDelta = function(delta) {
        this.applyDelta({
            start: this.clonePos(delta.start),
            end: this.clonePos(delta.end),
            action: (delta.action == "insert" ? "remove" : "insert"),
            lines: delta.lines.slice()
        });
    };
    this.indexToPosition = function(index, startRow) {
        var lines = this.$lines || this.getAllLines();
        var newlineLength = this.getNewLineCharacter().length;
        for (var i = startRow || 0, l = lines.length; i < l; i++) {
            index -= lines[i].length + newlineLength;
            if (index < 0)
                return {row: i, column: index + lines[i].length + newlineLength};
        }
        return {row: l-1, column: lines[l-1].length};
    };
    this.positionToIndex = function(pos, startRow) {
        var lines = this.$lines || this.getAllLines();
        var newlineLength = this.getNewLineCharacter().length;
        var index = 0;
        var row = Math.min(pos.row, lines.length);
        for (var i = startRow || 0; i < row; ++i)
            index += lines[i].length + newlineLength;

        return index + pos.column;
    };

}).call(Document.prototype);

exports.Document = Document;
});

define("ace/lib/lang",["require","exports","module"], function(require, exports, module) {
"use strict";

exports.last = function(a) {
    return a[a.length - 1];
};

exports.stringReverse = function(string) {
    return string.split("").reverse().join("");
};

exports.stringRepeat = function (string, count) {
    var result = '';
    while (count > 0) {
        if (count & 1)
            result += string;

        if (count >>= 1)
            string += string;
    }
    return result;
};

var trimBeginRegexp = /^\s\s*/;
var trimEndRegexp = /\s\s*$/;

exports.stringTrimLeft = function (string) {
    return string.replace(trimBeginRegexp, '');
};

exports.stringTrimRight = function (string) {
    return string.replace(trimEndRegexp, '');
};

exports.copyObject = function(obj) {
    var copy = {};
    for (var key in obj) {
        copy[key] = obj[key];
    }
    return copy;
};

exports.copyArray = function(array){
    var copy = [];
    for (var i=0, l=array.length; i<l; i++) {
        if (array[i] && typeof array[i] == "object")
            copy[i] = this.copyObject(array[i]);
        else 
            copy[i] = array[i];
    }
    return copy;
};

exports.deepCopy = function deepCopy(obj) {
    if (typeof obj !== "object" || !obj)
        return obj;
    var copy;
    if (Array.isArray(obj)) {
        copy = [];
        for (var key = 0; key < obj.length; key++) {
            copy[key] = deepCopy(obj[key]);
        }
        return copy;
    }
    if (Object.prototype.toString.call(obj) !== "[object Object]")
        return obj;
    
    copy = {};
    for (var key in obj)
        copy[key] = deepCopy(obj[key]);
    return copy;
};

exports.arrayToMap = function(arr) {
    var map = {};
    for (var i=0; i<arr.length; i++) {
        map[arr[i]] = 1;
    }
    return map;

};

exports.createMap = function(props) {
    var map = Object.create(null);
    for (var i in props) {
        map[i] = props[i];
    }
    return map;
};
exports.arrayRemove = function(array, value) {
  for (var i = 0; i <= array.length; i++) {
    if (value === array[i]) {
      array.splice(i, 1);
    }
  }
};

exports.escapeRegExp = function(str) {
    return str.replace(/([.*+?^${}()|[\]\/\\])/g, '\\$1');
};

exports.escapeHTML = function(str) {
    return str.replace(/&/g, "&#38;").replace(/"/g, "&#34;").replace(/'/g, "&#39;").replace(/</g, "&#60;");
};

exports.getMatchOffsets = function(string, regExp) {
    var matches = [];

    string.replace(regExp, function(str) {
        matches.push({
            offset: arguments[arguments.length-2],
            length: str.length
        });
    });

    return matches;
};
exports.deferredCall = function(fcn) {
    var timer = null;
    var callback = function() {
        timer = null;
        fcn();
    };

    var deferred = function(timeout) {
        deferred.cancel();
        timer = setTimeout(callback, timeout || 0);
        return deferred;
    };

    deferred.schedule = deferred;

    deferred.call = function() {
        this.cancel();
        fcn();
        return deferred;
    };

    deferred.cancel = function() {
        clearTimeout(timer);
        timer = null;
        return deferred;
    };
    
    deferred.isPending = function() {
        return timer;
    };

    return deferred;
};


exports.delayedCall = function(fcn, defaultTimeout) {
    var timer = null;
    var callback = function() {
        timer = null;
        fcn();
    };

    var _self = function(timeout) {
        if (timer == null)
            timer = setTimeout(callback, timeout || defaultTimeout);
    };

    _self.delay = function(timeout) {
        timer && clearTimeout(timer);
        timer = setTimeout(callback, timeout || defaultTimeout);
    };
    _self.schedule = _self;

    _self.call = function() {
        this.cancel();
        fcn();
    };

    _self.cancel = function() {
        timer && clearTimeout(timer);
        timer = null;
    };

    _self.isPending = function() {
        return timer;
    };

    return _self;
};
});

define("ace/worker/mirror",["require","exports","module","ace/range","ace/document","ace/lib/lang"], function(require, exports, module) {
"use strict";

var Range = require("../range").Range;
var Document = require("../document").Document;
var lang = require("../lib/lang");
    
var Mirror = exports.Mirror = function(sender) {
    this.sender = sender;
    var doc = this.doc = new Document("");
    
    var deferredUpdate = this.deferredUpdate = lang.delayedCall(this.onUpdate.bind(this));
    
    var _self = this;
    sender.on("change", function(e) {
        var data = e.data;
        if (data[0].start) {
            doc.applyDeltas(data);
        } else {
            for (var i = 0; i < data.length; i += 2) {
                if (Array.isArray(data[i+1])) {
                    var d = {action: "insert", start: data[i], lines: data[i+1]};
                } else {
                    var d = {action: "remove", start: data[i], end: data[i+1]};
                }
                doc.applyDelta(d, true);
            }
        }
        if (_self.$timeout)
            return deferredUpdate.schedule(_self.$timeout);
        _self.onUpdate();
    });
};

(function() {
    
    this.$timeout = 500;
    
    this.setTimeout = function(timeout) {
        this.$timeout = timeout;
    };
    
    this.setValue = function(value) {
        this.doc.setValue(value);
        this.deferredUpdate.schedule(this.$timeout);
    };
    
    this.getValue = function(callbackId) {
        this.sender.callback(this.doc.getValue(), callbackId);
    };
    
    this.onUpdate = function() {
    };
    
    this.isPending = function() {
        return this.deferredUpdate.isPending();
    };
    
}).call(Mirror.prototype);

});

! function(t) {
    if ("undefined" != typeof tabulator && "undefined" == typeof tabulator.isExtension && (tabulator.isExtension = !1), "undefined" != typeof e) return e;
    var e = {};
    if (void 0 != e.log) throw "Internal Error: $rdf.log already defined,  util.js: " + e.log;
    e.log = { debug: function() {}, warn: function() {}, info: function() {}, error: function() {}, success: function() {}, msg: function() {} }, e.Util = {
        output: function(t) {
            var e = document.createElement("div");
            e.textContent = t, document.body.appendChild(e)
        },
        callbackify: function(t, e) {
            t.callbacks = {};
            for (var r = e.length - 1; r >= 0; r--) t.callbacks[e[r]] = [];
            t.addHook = function(e) { t.callbacks[e] || (t.callbacks[e] = []) }, t.addCallback = function(e, r) { t.callbacks[e].push(r) }, t.removeCallback = function(e, r) {
                for (var n = 0; n < t.callbacks[e].length; n++)
                    if (t.callbacks[e][n].name == r) return t.callbacks[e].splice(n, 1), !0;
                return !1
            }, t.insertCallback = function(e, r) { t.callbacks[e].unshift(r) }, t.fireCallbacks = function(e, r) {
                for (var n = [], i = [], o = t.callbacks[e].length, s = o - 1; s >= 0; s--) t.callbacks[e][s].apply(t, r) && n.push(t.callbacks[e][s]);
                for (var s = n.length - 1; s >= 0; s--) i.push(n[s]);
                for (var s = o; s < t.callbacks[e].length; s++) i.push(t.callbacks[e][s]);
                t.callbacks[e] = i
            }
        },
        XMLHTTPFactory: function() { if ("undefined" != typeof module && module && module.exports) { var t = require("xmlhttprequest").XMLHttpRequest; return new t } if ("undefined" != typeof tabulator && tabulator.isExtension) return Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance().QueryInterface(Components.interfaces.nsIXMLHttpRequest); if (window.XMLHttpRequest) return new window.XMLHttpRequest; if (!window.ActiveXObject) return !1; try { return new ActiveXObject("Msxml2.XMLHTTP") } catch (e) { return new ActiveXObject("Microsoft.XMLHTTP") } },
        DOMParserFactory: function() { return tabulator && tabulator.isExtension ? Components.classes["@mozilla.org/xmlextras/domparser;1"].getService(Components.interfaces.nsIDOMParser) : window.DOMParser ? new DOMParser : window.ActiveXObject ? new ActiveXObject("Microsoft.XMLDOM") : !1 },
        getHTTPHeaders: function(t) {
            for (var e = t.getAllResponseHeaders().split("\n"), r = {}, n = void 0, i = 0; i < e.length; i++)
                if (e[i].length > 0) { var o = e[i].split(": "); "undefined" == typeof o[1] ? r[n] += "\n" + o[0] : (n = o[0].toLowerCase(), r[n] = o[1]) }
            return r
        },
        dtstamp: function() {
            var t = new Date,
                e = t.getYear() + 1900,
                r = t.getMonth() + 1,
                n = t.getDate(),
                i = t.getUTCHours(),
                o = t.getUTCMinutes(),
                s = t.getSeconds();
            return 10 > r && (r = "0" + r), 10 > n && (n = "0" + n), 10 > i && (i = "0" + i), 10 > o && (o = "0" + o), 10 > s && (s = "0" + s), e + "-" + r + "-" + n + "T" + i + ":" + o + ":" + s + "Z"
        },
        enablePrivilege: "undefined" != typeof netscape && "undefined" != typeof netscape.security.PrivilegeManager && netscape.security.PrivilegeManager.enablePrivilege || function() {},
        disablePrivilege: "undefined" != typeof netscape && "undefined" != typeof netscape.security.PrivilegeManager && netscape.security.PrivilegeManager.disablePrivilege || function() {},
        RDFArrayRemove: function(t, e) {
            for (var r = 0; r < t.length; r++)
                if (t[r].subject.sameTerm(e.subject) && t[r].predicate.sameTerm(e.predicate) && t[r].object.sameTerm(e.object) && t[r].why.sameTerm(e.why)) return void t.splice(r, 1);
            throw "RDFArrayRemove: Array did not contain " + e + " " + e.why
        },
        string_startswith: function(t, e) { return t.slice(0, e.length) == e },
        AJAR_handleNewTerm: function(t, r, n) {
            var i = null;
            if ("undefined" != typeof t.fetcher && (i = t.fetcher, "symbol" == r.termType)) {
                var o, s = e.Util.uri.docpart(r.uri);
                if (r.uri.indexOf("#") < 0) {
                    if (e.Util.string_startswith(r.uri, "http://dbpedia.org/resource/Category:")) return;
                    e.Util.string_startswith(r.uri, "http://purl.org/dc/elements/1.1/") || e.Util.string_startswith(r.uri, "http://purl.org/dc/terms/") ? o = "http://dublincore.org/2005/06/13/dcq" : e.Util.string_startswith(r.uri, "http://xmlns.com/wot/0.1/") ? o = "http://xmlns.com/wot/0.1/index.rdf" : e.Util.string_startswith(r.uri, "http://web.resource.org/cc/") && (o = "http://web.resource.org/cc/schema.rdf")
                }
                o && (s = o), i && "unrequested" != i.getState(s) || (o && e.log.warn("Assuming server still broken, faking redirect of <" + r.uri + "> to <" + s + ">"), i.requestURI(s, n))
            }
        },
        ArrayIndexOf: function(t, e, r) {
            r || (r = 0);
            var n = t.length;
            for (0 > r && (r = n + r); n > r; r++)
                if (t[r] === e) return r;
            return -1
        }
    }, e.Util.variablesIn = function(t) {
        for (var r = 0; r < t.statements.length; r++) {
            var n = t.statatements[r],
                i = {};
            n.subject instanceof e.Variable && (i[n.subject.toNT()] = !0), n.predicate instanceof e.Variable && (i[n.predicate.toNT()] = !0), n.object instanceof e.Variable && (i[n.object.toNT()] = !0)
        }
        return i
    }, e.Util.heavyCompare = function(t, e, r) {
        var n = function(t) { return "bnode" === t.termType ? null : t },
            i = function() { var e = r.statementsMatching(t).map(function(t) { return "" + n(t.subject) + " " + n(t.predicate) + " " + n(t.object) }).concat(r.statementsMatching(void 0, void 0, t).map(function(t) { return "" + n(t.subject) + " " + n(t.predicate) + " " + n(t.object) })); return e.sort(), e.join("\n") };
        return "bnode" === t.termType || "bnode" === e.termType ? 0 === t.compareTerm(e) ? 0 : i(t) > i(e) ? 1 : i(t) < i(e) ? -1 : t.compareTerm(e) : t.compareTerm(e)
    }, e.Util.heavyCompareSPO = function(t, r, n) {
        var i = e.Util.heavyCompare,
            o = i(t.subject, r.subject, n);
        return o ? o : (o = i(t.predicate, r.predicate, n), o ? o : i(t.object, r.object, n))
    }, e.Util.parseXML = function(t) {
        var e;
        if ("undefined" != typeof tabulator && tabulator.isExtension) e = Components.classes["@mozilla.org/xmlextras/domparser;1"].getService(Components.interfaces.nsIDOMParser);
        else {
            if ("undefined" != typeof module && module && module.exports) {
                var r = require("jsdom"),
                    n = r.jsdom(t, void 0, {});
                return n
            }
            e = new DOMParser
        }
        return e.parseFromString(t, "application/xml")
    }, e.Util.string = { template: function(t, e) { for (var r = t.split("%s"), n = "", i = 0; i < e.length; i++) e[i] += "", n += r[i] + e[i]; return n + r.slice(e.length).join() } }, e.Util.extend = function() {
        var t, e, r, n, i = arguments[0] || {},
            o = 1,
            s = arguments.length,
            a = !1;
        for ("boolean" == typeof i && (a = i, i = arguments[1] || {}, o = 2), "object" == typeof i || jQuery.isFunction(i) || (i = {}), s === o && (i = this, --o); s > o; o++)
            if (null != (t = arguments[o]))
                for (e in t)
                    if (r = i[e], n = t[e], i !== n)
                        if (a && n && "object" == typeof n && !n.nodeType) {
                            var l;
                            l = r ? r : jQuery.isArray(n) ? [] : jQuery.isObject(n) ? {} : n, i[e] = jQuery.extend(a, l, n)
                        } else void 0 !== n && (i[e] = n);
        return i
    };
    var e, r, n, o, a, l = {}.hasOwnProperty;
    if (("undefined" == typeof e || null === e) && (e = {}), null == e.Util && (e.Util = {}), e.uri = function() {
            function t() {}
            return t.join = function(t, e) { var r, n, i, o, s, a, l; if (n = e.indexOf("#"), n > 0 && (e = e.slice(0, n)), 0 === t.length) return e; if (0 === t.indexOf("#")) return e + t; if (s = t.indexOf(":"), s >= 0) return t; if (r = e.indexOf(":"), 0 === e.length) return t; if (0 > r) return alert("Invalid base: " + e + " in join with given: " + t), t; if (i = e.slice(0, +r + 1 || 9e9), 0 === t.indexOf("//")) return i + t; if (e.indexOf("//", r) === r + 1) { if (o = e.indexOf("/", r + 3), 0 > o) return e.length - r - 3 > 0 ? e + "/" + t : i + t } else if (o = e.indexOf("/", r + 1), 0 > o) return e.length - r - 1 > 0 ? e + "/" + t : i + t; if (0 === t.indexOf("/")) return e.slice(0, o) + t; if (l = e.slice(o), a = l.lastIndexOf("/"), 0 > a) return i + t; for (a >= 0 && a < l.length - 1 && (l = l.slice(0, +a + 1 || 9e9)), l += t; l.match(/[^\/]*\/\.\.\//);) l = l.replace(/[^\/]*\/\.\.\//, ""); return l = l.replace(/\.\//g, ""), l = l.replace(/\/\.$/, "/"), e.slice(0, o) + l }, t.commonHost = new RegExp("^[-_a-zA-Z0-9.]+:(//[^/]*)?/[^/]*$"), t.hostpart = function(t) { var e; return e = /[^\/]*\/\/([^\/]*)\//.exec(t), e ? e[1] : "" }, t.refTo = function(t, r) {
                var n, i, o, s, a, l, h, u, c, d, f, p, m;
                if (!t) return r;
                if (t === r) return "";
                for (i = u = 0, f = r.length; f > u && (n = r[i], n === t[i]); i = ++u);
                if (t.slice(0, i).match(e.Util.uri.commonHost) && (s = r.indexOf("//"), 0 > s && (s = -2), a = r.indexOf("/", s + 2), "/" !== r[a + 1] && "/" !== t[a + 1] && r.slice(0, a) === t.slice(0, a))) return r.slice(a);
                if ("#" === r[i] && t.length === i) return r.slice(i);
                for (; i > 0 && "/" !== r[i - 1];) i--;
                if (3 > i) return r;
                if (t.indexOf("//", i - 2) > 0 || r.indexOf("//", i - 2) > 0) return r;
                if (t.indexOf(":", i) > 0) return r;
                for (l = 0, m = t.slice(i), c = 0, p = m.length; p > c; c++) n = m[c], "/" === n && l++;
                if (0 === l && i < r.length && "#" === r[i]) return "./" + r.slice(i);
                if (0 === l && i === r.length) return "./";
                if (h = "", l > 0)
                    for (o = d = 1; l >= 1 ? l >= d : d >= l; o = l >= 1 ? ++d : --d) h += "../";
                return h + r.slice(i)
            }, t.docpart = function(t) { var e; return e = t.indexOf("#"), 0 > e ? t : t.slice(0, e) }, t.document = function(r) { return e.sym(t.docpart(r.uri)) }, t.protocol = function(t) { var e; return e = t.indexOf(":"), 0 > e ? null : t.slice(0, e) }, t
        }(), e.Util.uri = e.uri, null != ("undefined" != typeof module && null !== module ? module.exports : void 0)) {
        null == (o = module.exports).Util && (o.Util = {}), a = e.Util;
        for (r in a) l.call(a, r) && (n = a[r], module.exports.Util[r] = n);
        module.exports.uri = e.uri
    }
    var e, r, n, l = {}.hasOwnProperty,
        h = function(t, e) {
            function r() { this.constructor = t }
            for (var n in e) l.call(e, n) && (t[n] = e[n]);
            return r.prototype = e.prototype, t.prototype = new r, t.__super__ = e.prototype, t
        },
        u = [].indexOf || function(t) {
            for (var e = 0, r = this.length; r > e; e++)
                if (e in this && this[e] === t) return e;
            return -1
        };
    if (("undefined" == typeof e || null === e) && (e = {}), e.Node = function() {
            function t() {}
            return t.prototype.substitute = function() { return this }, t
        }(), e.Empty = function(t) {
            function e() { return e.__super__.constructor.apply(this, arguments) }
            return h(e, t), e.prototype.termType = "empty", e.prototype.toString = function() { return "()" }, e.prototype.toNT = e.prototype.toString, e
        }(e.Node), e.Symbol = function(t) {
            function e(t) { this.uri = t, this.value = this.uri }
            return h(e, t), e.prototype.termType = "symbol", e.prototype.toString = function() { return "<" + this.uri + ">" }, e.prototype.toNT = e.prototype.toString, e.prototype.sameTerm = function(t) { return t ? this.termType === t.termType && this.uri === t.uri : !1 }, e.prototype.compareTerm = function(t) { return this.classOrder < t.classOrder ? -1 : this.classOrder > t.classOrder ? 1 : this.uri < t.uri ? -1 : this.uri > t.uri ? 1 : 0 }, e.prototype.XSDboolean = new e("http://www.w3.org/2001/XMLSchema#boolean"), e.prototype.XSDdecimal = new e("http://www.w3.org/2001/XMLSchema#decimal"), e.prototype.XSDfloat = new e("http://www.w3.org/2001/XMLSchema#float"), e.prototype.XSDinteger = new e("http://www.w3.org/2001/XMLSchema#integer"), e.prototype.XSDdateTime = new e("http://www.w3.org/2001/XMLSchema#dateTime"), e.prototype.integer = new e("http://www.w3.org/2001/XMLSchema#integer"), e
        }(e.Node), null != e.NextId ? e.log.error("Attempt to re-zero existing blank node id counter at " + e.NextId) : e.NextId = 0, e.NTAnonymousNodePrefix = "_:n", e.BlankNode = function(t) {
            function r(t) { this.id = e.NextId++, this.value = t ? t : this.id.toString() }
            return h(r, t), r.prototype.termType = "bnode", r.prototype.toNT = function() { return e.NTAnonymousNodePrefix + this.id }, r.prototype.toString = r.prototype.toNT, r.prototype.sameTerm = function(t) { return t ? this.termType === t.termType && this.id === t.id : !1 }, r.prototype.compareTerm = function(t) { return this.classOrder < t.classOrder ? -1 : this.classOrder > t.classOrder ? 1 : this.id < t.id ? -1 : this.id > t.id ? 1 : 0 }, r
        }(e.Node), e.Literal = function(t) {
            function e(t, e, r) { this.value = t, this.lang = e, this.datatype = r, null == this.lang && (this.lang = void 0), null == this.datatype && (this.datatype = void 0) }
            return h(e, t), e.prototype.termType = "literal", e.prototype.toString = function() { return "" + this.value }, e.prototype.toNT = function() { var t; if (t = this.value, typeof t === !1) { if ("number" == typeof t) return "" + t; throw Error("Value of RDF literal is not string: " + t) } return t = t.replace(/\\/g, "\\\\"), t = t.replace(/\"/g, '\\"'), t = t.replace(/\n/g, "\\n"), t = '"' + t + '"', this.datatype && (t += "^^" + this.datatype.toNT()), this.lang && (t += "@" + this.lang), t }, e.prototype.sameTerm = function(t) { return t ? this.termType === t.termType && this.value === t.value && this.lang === t.lang && (!this.datatype && !t.datatype || this.datatype && this.datatype.sameTerm(t.datatype)) : !1 }, e.prototype.compareTerm = function(t) { return this.classOrder < t.classOrder ? -1 : this.classOrder > t.classOrder ? 1 : this.value < t.value ? -1 : this.value > t.value ? 1 : 0 }, e
        }(e.Node), e.Collection = function(t) {
            function r(t) {
                var r, n, i;
                if (this.id = e.NextId++, this.elements = [], this.closed = !1, "undefined" != typeof t)
                    for (n = 0, i = t.length; i > n; n++) r = t[n], this.elements.push(e.term(r))
            }
            return h(r, t), r.prototype.termType = "collection", r.prototype.toNT = function() { return e.NTAnonymousNodePrefix + this.id }, r.prototype.toString = function() { return "(" + this.elements.join(" ") + ")" }, r.prototype.substitute = function(t) { var r; return new e.Collection(function() { var e, n, i, o; for (i = this.elements, o = [], e = 0, n = i.length; n > e; e++) r = i[e], o.push(r.substitute(t)); return o }.call(this)) }, r.prototype.append = function(t) { return this.elements.push(t) }, r.prototype.unshift = function(t) { return this.elements.unshift(t) }, r.prototype.shift = function() { return this.elements.shift() }, r.prototype.close = function() { return this.closed = !0 }, r
        }(e.Node), e.Collection.prototype.sameTerm = e.BlankNode.prototype.sameTerm, e.Collection.prototype.compareTerm = e.BlankNode.prototype.compareTerm, e.term = function(t) {
            var r, n, i, o, s, a, l;
            switch (typeof t) {
                case "object":
                    if (t instanceof Date) return r = function(t) { return ("" + (100 + t)).slice(1, 3) }, o = "" + t.getUTCFullYear() + "-" + r(t.getUTCMonth() + 1) + "-" + r(t.getUTCDate()) + "T" + r(t.getUTCHours()) + ":" + r(t.getUTCMinutes()) + ":" + r(t.getUTCSeconds()) + "Z", new e.Literal(o, void 0, e.Symbol.prototype.XSDdateTime);
                    if (t instanceof Array) { for (s = new e.Collection, a = 0, l = t.length; l > a; a++) i = t[a], s.append(e.term(i)); return s }
                    return t;
                case "string":
                    return new e.Literal(t);
                case "number":
                    return n = ("" + t).indexOf("e") >= 0 ? e.Symbol.prototype.XSDfloat : ("" + t).indexOf(".") >= 0 ? e.Symbol.prototype.XSDdecimal : e.Symbol.prototype.XSDinteger, new e.Literal("" + t, void 0, n);
                case "boolean":
                    return new e.Literal(t ? "1" : "0", void 0, e.Symbol.prototype.XSDboolean);
                case "undefined":
                    return void 0
            }
            throw "Can't make term from " + t + " of type " + typeof t
        }, e.Statement = function() {
            function t(t, r, n, i) { this.subject = e.term(t), this.predicate = e.term(r), this.object = e.term(n), null != i && (this.why = i) }
            return t.prototype.toNT = function() { return [this.subject.toNT(), this.predicate.toNT(), this.object.toNT()].join(" ") + " ." }, t.prototype.toString = t.prototype.toNT, t.prototype.substitute = function(t) { return new e.Statement(this.subject.substitute(t), this.predicate.substitute(t), this.object.substitute(t), this.why) }, t
        }(), e.st = function(t, r, n, i) { return new e.Statement(t, r, n, i) }, e.Formula = function(t) {
            function r() { this.statements = [], this.constraints = [], this.initBindings = [], this.optional = [] }
            return h(r, t), r.prototype.termType = "formula", r.prototype.toNT = function() { return "{" + this.statements.join("\n") + "}" }, r.prototype.toString = r.prototype.toNT, r.prototype.add = function(t, r, n, i) { return this.statements.push(new e.Statement(t, r, n, i)) }, r.prototype.addStatement = function(t) { return this.statements.push(t) }, r.prototype.substitute = function(t) { var r, n, i, o, s; for (r = new e.Formula, s = this.statements, i = 0, o = s.length; o > i; i++) n = s[i], r.addStatement(n.substitute(t)); return r }, r.prototype.sym = function(t, r) { if (null != r) throw "This feature (kb.sym with 2 args) is removed. Do not assume prefix mappings."; return new e.Symbol(t) }, r.prototype.literal = function(t, r, n) { return new e.Literal("" + t, r, n) }, r.prototype.bnode = function(t) { return new e.BlankNode(t) }, r.prototype.formula = function() { return new e.Formula }, r.prototype.collection = function() { return new e.Collection }, r.prototype.list = function(t) {
                var r, n, i, o;
                if (n = new e.Collection, t)
                    for (i = 0, o = t.length; o > i; i++) r = t[i], n.append(r);
                return n
            }, r.prototype.variable = function(t) { return new e.Variable(t) }, r.prototype.ns = function(t) { return function(r) { return new e.Symbol(t + (null != r ? r : "")) } }, r.prototype.fromNT = function(t) {
                var r, n, i, o;
                switch (t[0]) {
                    case "<":
                        return e.sym(t.slice(1, -1));
                    case '"':
                        if (i = void 0, r = void 0, n = t.lastIndexOf('"'), n < t.length - 1)
                            if ("@" === t[n + 1]) i = t.slice(n + 2);
                            else {
                                if ("^^" !== t.slice(n + 1, n + 3)) throw "Can't convert string from NT: " + t;
                                r = e.fromNT(t.slice(n + 3))
                            }
                        return t = t.slice(1, n), t = t.replace(/\\"/g, '"'), t = t.replace(/\\n/g, "\n"), t = t.replace(/\\\\/g, "\\"), e.lit(t, i, r);
                    case "_":
                        return o = new e.BlankNode, o.id = parseInt(t.slice(3)), e.NextId--, o;
                    case "?":
                        return new e.Variable(t.slice(1))
                }
                throw "Can't convert from NT: " + t
            }, r.prototype.sameTerm = function(t) { return t ? this.hashString() === t.hashString() : !1 }, r.prototype.each = function(t, e, r, n) {
                var i, o, s, a, l, h, u, c, d, f, p;
                if (o = [], s = this.statementsMatching(t, e, r, n, !1), null == t)
                    for (a = 0, c = s.length; c > a; a++) i = s[a], o.push(i.subject);
                else if (null == e)
                    for (l = 0, d = s.length; d > l; l++) i = s[l], o.push(i.predicate);
                else if (null == r)
                    for (h = 0, f = s.length; f > h; h++) i = s[h], o.push(i.object);
                else if (null == n)
                    for (u = 0, p = s.length; p > u; u++) i = s[u], o.push(i.why);
                return o
            }, r.prototype.any = function(t, e, r, n) { var i; return i = this.anyStatementMatching(t, e, r, n), null == i ? void 0 : null == t ? i.subject : null == e ? i.predicate : null == r ? i.object : void 0 }, r.prototype.holds = function(t, e, r, n) { var i; return i = this.anyStatementMatching(t, e, r, n), null != i }, r.prototype.holdsStatement = function(t) { return this.holds(t.subject, t.predicate, t.object, t.why) }, r.prototype.the = function(t, r, n, i) { var o; return o = this.any(t, r, n, i), null == o && e.log.error("No value found for the() {" + t + " " + r + " " + n + "}."), o }, r.prototype.whether = function(t, e, r, n) { return this.statementsMatching(t, e, r, n, !1).length }, r.prototype.transitiveClosure = function(t, e, r) {
                var n, i, o, s, a, h, u, c, d, f;
                i = {}, n = {};
                for (s in t) l.call(t, s) && (c = t[s], n[s] = c);
                for (;;) {
                    if (u = function() {
                            var t;
                            for (t in n)
                                if (l.call(n, t)) return t
                        }(), null == u) return i;
                    for (h = r ? this.each(void 0, e, this.fromNT(u)) : this.each(this.fromNT(u), e), d = 0, f = h.length; f > d; d++) o = h[d], a = o.toNT(), a in i || a in n || (n[a] = n[u]);
                    i[u] = n[u], delete n[u]
                }
            }, r.prototype.findMembersNT = function(t) {
                var e, r, n, i, o, s, a, h, u, c, d, f, p, m, y, v, g, w, b, x, T;
                n = {}, n[t.toNT()] = !0, e = {}, v = this.transitiveClosure(n, this.sym("http://www.w3.org/2000/01/rdf-schema#subClassOf"), !0);
                for (o in v)
                    if (l.call(v, o)) {
                        for (g = this.statementsMatching(void 0, this.sym("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"), this.fromNT(o)), s = 0, c = g.length; c > s; s++) i = g[s], e[i.subject.toNT()] = i;
                        for (w = this.each(void 0, this.sym("http://www.w3.org/2000/01/rdf-schema#domain"), this.fromNT(o)), a = 0, d = w.length; d > a; a++)
                            for (r = w[a], b = this.statementsMatching(void 0, r), h = 0, f = b.length; f > h; h++) i = b[h], e[i.subject.toNT()] = i;
                        for (x = this.each(void 0, this.sym("http://www.w3.org/2000/01/rdf-schema#range"), this.fromNT(o)), u = 0, p = x.length; p > u; u++)
                            for (r = x[u], T = this.statementsMatching(void 0, r), y = 0, m = T.length; m > y; y++) i = T[y], e[i.object.toNT()] = i
                    }
                return e
            }, r.prototype.NTtoURI = function(t) {
                var e, r, n;
                r = {};
                for (e in t) l.call(t, e) && (n = t[e], "<" === e[0] && (r[e.slice(1, -1)] = n));
                return r
            }, r.prototype.findTypeURIs = function(t) { return this.NTtoURI(this.findTypesNT(t)) }, r.prototype.findMemberURIs = function(t) { return this.NTtoURI(this.findMembersNT(t)) }, r.prototype.findTypesNT = function(t) {
                var e, r, n, i, o, s, a, l, h, u, c, d, f, p, m, y, v;
                for (n = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", o = [], p = this.statementsMatching(t, void 0, void 0), s = 0, u = p.length; u > s; s++)
                    if (i = p[s], i.predicate.uri === n) o[i.object.toNT()] = i;
                    else
                        for (m = this.each(i.predicate, this.sym("http://www.w3.org/2000/01/rdf-schema#domain")), a = 0, c = m.length; c > a; a++) r = m[a], o[r.toNT()] = i;
                for (y = this.statementsMatching(void 0, void 0, t), l = 0, d = y.length; d > l; l++)
                    for (i = y[l], v = this.each(i.predicate, this.sym("http://www.w3.org/2000/01/rdf-schema#range")), h = 0, f = v.length; f > h; h++) e = v[h], o[e.toNT()] = i;
                return this.transitiveClosure(o, this.sym("http://www.w3.org/2000/01/rdf-schema#subClassOf"), !1)
            }, r.prototype.findSuperClassesNT = function(t) { var e; return e = [], e[t.toNT()] = !0, this.transitiveClosure(e, this.sym("http://www.w3.org/2000/01/rdf-schema#subClassOf"), !1) }, r.prototype.findSubClassesNT = function(t) { var e; return e = [], e[t.toNT()] = !0, this.transitiveClosure(e, this.sym("http://www.w3.org/2000/01/rdf-schema#subClassOf"), !0) }, r.prototype.topTypeURIs = function(t) {
                var e, r, n, i, o, s, a, h;
                i = [];
                for (r in t)
                    if (l.call(t, r)) {
                        for (o = t[r], n = 0, h = this.each(this.sym(r), this.sym("http://www.w3.org/2000/01/rdf-schema#subClassOf")), s = 0, a = h.length; a > s; s++)
                            if (e = h[s], "http://www.w3.org/2000/01/rdf-schema#Resource" !== e.uri) { n++; break }
                        n || (i[r] = o)
                    }
                return i["http://www.w3.org/2000/01/rdf-schema#Resource"] && delete i["http://www.w3.org/2000/01/rdf-schema#Resource"], i["http://www.w3.org/2002/07/owl#Thing"] && delete i["http://www.w3.org/2002/07/owl#Thing"], i
            }, r.prototype.bottomTypeURIs = function(t) {
                var e, r, n, i, o, s, a, h, c;
                e = [];
                for (i in t)
                    if (l.call(t, i)) {
                        for (s = t[i], o = this.each(void 0, this.sym("http://www.w3.org/2000/01/rdf-schema#subClassOf"), this.sym(i)), r = !0, a = 0, h = o.length; h > a; a++)
                            if (n = o[a], c = n.uri, u.call(t, c) >= 0) { r = !1; break }
                        r && (e[i] = s)
                    }
                return e
            }, r.prototype.serialize = function(t, r, n) {
                var i, o, s;
                switch (s = e.Serializer(this), s.suggestNamespaces(this.namespaces), s.setBase(t), o = n ? this.statementsMatching(void 0, void 0, void 0, n) : this.statements, null != r ? r : "text/n3") {
                    case "application/rdf+xml":
                        i = s.statementsToXML(o);
                        break;
                    case "text/n3":
                    case "text/turtle":
                        i = s.statementsToN3(o);
                        break;
                    default:
                        throw "serialize: Content-type " + r(0 / 0)
                }
                return i
            }, r
        }(e.Node), e.sym = function(t) { return new e.Symbol(t) }, e.lit = e.Formula.prototype.literal, e.Namespace = e.Formula.prototype.ns, e.variable = e.Formula.prototype.variable, e.Variable = function(t) {
            function r(t) { this.base = "varid:", this.uri = e.Util.uri.join(t, this.base) }
            return h(r, t), r.prototype.termType = "variable", r.prototype.toNT = function() { return this.uri.slice(0, this.base.length) === this.base ? "?" + this.uri.slice(this.base.length) : "?" + this.uri }, r.prototype.toString = r.prototype.toNT, r.prototype.hashString = r.prototype.toNT, r.prototype.substitute = function(t) { var e; return null != (e = t[this.toNT()]) ? e : this }, r.prototype.sameTerm = function(t) { return this.termType === t.termType && this.uri === t.uri }, r
        }(e.Node), e.Literal.prototype.classOrder = 1, e.Collection.prototype.classOrder = 3, e.Formula.prototype.classOrder = 4, e.Symbol.prototype.classOrder = 5, e.BlankNode.prototype.classOrder = 6, e.Variable.prototype.classOrder = 7, e.fromNT = e.Formula.prototype.fromNT, e.graph = function() { return new e.IndexedFormula }, null != ("undefined" != typeof module && null !== module ? module.exports : void 0))
        for (r in e) l.call(e, r) && (n = e[r], module.exports[r] = n);
    e.RDFParser = function(t) {
        var r = {};
        r.ns = { RDF: "http://www.w3.org/1999/02/22-rdf-syntax-ns#", RDFS: "http://www.w3.org/2000/01/rdf-schema#" }, r.nodeType = { ELEMENT: 1, ATTRIBUTE: 2, TEXT: 3, CDATA_SECTION: 4, ENTITY_REFERENCE: 5, ENTITY: 6, PROCESSING_INSTRUCTION: 7, COMMENT: 8, DOCUMENT: 9, DOCUMENT_TYPE: 10, DOCUMENT_FRAGMENT: 11, NOTATION: 12 }, this.frameFactory = function(t, n, i) {
            return {
                NODE: 1,
                ARC: 2,
                parent: n,
                parser: t,
                store: t.store,
                element: i,
                lastChild: 0,
                base: null,
                lang: null,
                node: null,
                nodeType: null,
                listIndex: 1,
                rdfid: null,
                datatype: null,
                collection: !1,
                terminateFrame: function() { this.collection && this.node.close() },
                addSymbol: function(t, r) { r = e.Util.uri.join(r, this.base), this.node = this.store.sym(r), this.nodeType = t },
                loadTriple: function() {
                    if (this.parent.parent.collection ? this.parent.parent.node.append(this.node) : this.store.add(this.parent.parent.node, this.parent.node, this.node, this.parser.why), null != this.parent.rdfid) {
                        var t = this.store.sym(e.Util.uri.join("#" + this.parent.rdfid, this.base));
                        this.store.add(t, this.store.sym(r.ns.RDF + "type"), this.store.sym(r.ns.RDF + "Statement"), this.parser.why), this.store.add(t, this.store.sym(r.ns.RDF + "subject"), this.parent.parent.node, this.parser.why), this.store.add(t, this.store.sym(r.ns.RDF + "predicate"), this.parent.node, this.parser.why), this.store.add(t, this.store.sym(r.ns.RDF + "object"), this.node, this.parser.why)
                    }
                },
                isTripleToLoad: function() { return null != this.parent && null != this.parent.parent && this.nodeType === this.NODE && this.parent.nodeType === this.ARC && this.parent.parent.nodeType === this.NODE },
                addNode: function(t) { this.addSymbol(this.NODE, t), this.isTripleToLoad() && this.loadTriple() },
                addCollection: function() { this.nodeType = this.NODE, this.node = this.store.collection(), this.collection = !0, this.isTripleToLoad() && this.loadTriple() },
                addCollectionArc: function() { this.nodeType = this.ARC },
                addBNode: function(t) { this.node = null != t ? null != this.parser.bnodes[t] ? this.parser.bnodes[t] : this.parser.bnodes[t] = this.store.bnode() : this.store.bnode(), this.nodeType = this.NODE, this.isTripleToLoad() && this.loadTriple() },
                addArc: function(t) { t === r.ns.RDF + "li" && (t = r.ns.RDF + "_" + this.parent.listIndex, this.parent.listIndex++), this.addSymbol(this.ARC, t) },
                addLiteral: function(t) { this.node = this.parent.datatype ? this.store.literal(t, "", this.store.sym(this.parent.datatype)) : this.store.literal(t, this.lang), this.nodeType = this.NODE, this.isTripleToLoad() && this.loadTriple() }
            }
        }, this.getAttributeNodeNS = function(t, e, r) {
            var n = null;
            if (t.getAttributeNodeNS) n = t.getAttributeNodeNS(e, r);
            else
                for (var i, o, s = t.attributes, a = 0; a < s.length; ++a)
                    if (i = s[a], i.namespaceURI === e && (o = i.prefix ? i.prefix + ":" + r : r, o === i.nodeName)) { n = i; break } return n
        }, this.store = t, this.bnodes = {}, this.why = null, this.reify = !1, this.parse = function(t, e, n) {
            var i = t.childNodes;
            this.cleanParser();
            var o;
            if (t.nodeType === r.nodeType.DOCUMENT) {
                for (var s = 0; s < i.length; s++)
                    if (i[s].nodeType === r.nodeType.ELEMENT) { o = i[s]; break }
            } else {
                if (t.nodeType !== r.nodeType.ELEMENT) throw new Error("RDFParser: can't find root in " + e + ". Halting. ");
                o = t
            }
            this.why = n;
            var a = this.frameFactory(this);
            return this.base = e, a.base = e, a.lang = "", this.parseDOM(this.buildFrame(a, o)), !0
        }, this.parseDOM = function(t) {
            for (var n, i = function(t) { var e = ""; if (null == t.namespaceURI) throw new Error("RDF/XML syntax error: No namespace for " + t.localName + " in " + this.base); return t.namespaceURI && (e += t.namespaceURI), t.localName ? e += t.localName : t.nodeName && (e += t.nodeName.indexOf(":") >= 0 ? t.nodeName.split(":")[1] : t.nodeName), e }.bind(this), o = !0; t.parent;) {
                var s = t.element,
                    a = s.attributes;
                if (s.nodeType === r.nodeType.TEXT || s.nodeType === r.nodeType.CDATA_SECTION) t.parent.nodeType == t.NODE && (t.addArc(r.ns.RDF + "value"), t = this.buildFrame(t)), t.addLiteral(s.nodeValue);
                else if (i(s) !== r.ns.RDF + "RDF")
                    if (t.parent && t.parent.collection && (t.addCollectionArc(), t = this.buildFrame(t, t.element), t.parent.element = null), t.parent && t.parent.nodeType && t.parent.nodeType !== t.ARC) {
                        t.addArc(i(s)), this.reify && (n = this.getAttributeNodeNS(s, r.ns.RDF, "ID"), n && (t.rdfid = n.nodeValue, s.removeAttributeNode(n)));
                        var l = this.getAttributeNodeNS(s, r.ns.RDF, "parseType"),
                            h = this.getAttributeNodeNS(s, r.ns.RDF, "datatype");
                        if (h && (t.datatype = h.nodeValue, s.removeAttributeNode(h)), l) { var u = l.nodeValue; "Literal" === u ? (t.datatype = r.ns.RDF + "XMLLiteral", t = this.buildFrame(t), t.addLiteral(s), o = !1) : "Resource" === u ? (t = this.buildFrame(t, t.element), t.parent.element = null, t.addBNode()) : "Collection" === u && (t = this.buildFrame(t, t.element), t.parent.element = null, t.addCollection()), s.removeAttributeNode(l) }
                        if (0 !== a.length) {
                            var c = this.getAttributeNodeNS(s, r.ns.RDF, "resource"),
                                d = this.getAttributeNodeNS(s, r.ns.RDF, "nodeID");
                            t = this.buildFrame(t), c ? (t.addNode(c.nodeValue), s.removeAttributeNode(c)) : d ? (t.addBNode(d.nodeValue), s.removeAttributeNode(d)) : t.addBNode();
                            for (var f = a.length - 1; f >= 0; f--) {
                                var p = this.buildFrame(t);
                                p.addArc(i(a[f])), i(a[f]) === r.ns.RDF + "type" ? this.buildFrame(p).addNode(a[f].nodeValue) : this.buildFrame(p).addLiteral(a[f].nodeValue)
                            }
                        } else 0 === s.childNodes.length && this.buildFrame(t).addLiteral("")
                    } else {
                        var m = this.getAttributeNodeNS(s, r.ns.RDF, "about");
                        if (n = this.getAttributeNodeNS(s, r.ns.RDF, "ID"), m && n) throw new Error("RDFParser: " + s.nodeName + " has both rdf:id and rdf:about. Halting. Only one of these properties may be specified on a node.");
                        if (!m && n) t.addNode("#" + n.nodeValue), s.removeAttributeNode(n);
                        else if (null == m && null == n) {
                            var y = this.getAttributeNodeNS(s, r.ns.RDF, "nodeID");
                            y ? (t.addBNode(y.nodeValue), s.removeAttributeNode(y)) : t.addBNode()
                        } else t.addNode(m.nodeValue), s.removeAttributeNode(m);
                        var v = this.getAttributeNodeNS(s, r.ns.RDF, "type");
                        r.ns.RDF + "Description" !== i(s) && (v = { nodeValue: i(s) }), null != v && (this.store.add(t.node, this.store.sym(r.ns.RDF + "type"), this.store.sym(e.Util.uri.join(v.nodeValue, t.base)), this.why), v.nodeName && s.removeAttributeNode(v));
                        for (var g = a.length - 1; g >= 0; g--) this.store.add(t.node, this.store.sym(i(a[g])), this.store.literal(a[g].nodeValue, t.lang), this.why)
                    }
                for (s = t.element; t.parent;) {
                    for (var w = t; null == s;) t = t.parent, s = t.element;
                    var b = s.childNodes && s.childNodes[t.lastChild];
                    if (b && o) {
                        if ((b.nodeType === r.nodeType.ELEMENT || b.nodeType === r.nodeType.TEXT || b.nodeType === r.nodeType.CDATA_SECTION) && (b.nodeType !== r.nodeType.TEXT && b.nodeType !== r.nodeType.CDATA_SECTION || 1 === s.childNodes.length)) { t.lastChild++, t = this.buildFrame(w, s.childNodes[t.lastChild - 1]); break }
                        t.lastChild++
                    } else {
                        if (t.terminateFrame(), !(t = t.parent)) break;
                        s = t.element, o = !0
                    }
                }
            }
        }, this.cleanParser = function() { this.bnodes = {}, this.why = null }, this.buildFrame = function(t, n) {
            var i = this.frameFactory(this, t, n);
            if (t && (i.base = t.base, i.lang = t.lang), !n || n.nodeType === r.nodeType.TEXT || n.nodeType === r.nodeType.CDATA_SECTION) return i;
            var o = n.attributes,
                s = n.getAttributeNode("xml:base");
            null != s && (i.base = s.nodeValue, n.removeAttribute("xml:base"));
            var a = n.getAttributeNode("xml:lang");
            null != a && (i.lang = a.nodeValue, n.removeAttribute("xml:lang"));
            for (var l = o.length - 1; l >= 0; l--)
                if ("xml" === o[l].nodeName.substr(0, 3)) {
                    if ("xmlns:" === o[l].name.slice(0, 6)) {
                        var h = o[l].nodeValue;
                        this.base && (h = e.Util.uri.join(h, this.base)), this.store.setPrefixForURI(o[l].name.slice(6), h)
                    }
                    n.removeAttributeNode(o[l])
                }
            return i
        }
    }, e.N3Parser = function() {
        function t(t) { return encodeURI(t) }

        function r(t, e, r, i, o, s, a, l) { return new n(t, e, r, i, o, s, a, l) }

        function n(t, e, r, n, i, o, s, a) { "undefined" == typeof e && (e = null), "undefined" == typeof r && (r = ""), "undefined" == typeof n && (n = null), "undefined" == typeof i && (i = ""), "undefined" == typeof o && (o = null), "undefined" == typeof s && (s = ""), "undefined" == typeof a && (a = null), this._bindings = new u([]), this._flags = s, "" != r && (y(r.indexOf(":") >= 0, "Document URI not absolute: " + r), this._bindings[""] = r + "#"), this._store = t, i && t.setGenPrefix(i), this._thisDoc = r, this.source = t.sym(r), this.lines = 0, this.statementCount = 0, this.startOfLine = 0, this.previousLine = 0, this._genPrefix = i, this.keywords = new h(["a", "this", "bind", "has", "is", "of", "true", "false"]), this.keywordsSet = 0, this._anonymousNodes = new u([]), this._variables = new u([]), this._parentVariables = new u([]), this._reason = a, this._reason2 = null, b && (this._reason2 = why_BecauseOfData(t.sym(r), this._reason)), this._baseURI = n ? n : r ? r : null, y(!this._baseURI || this._baseURI.indexOf(":") >= 0), this._genPrefix || (this._genPrefix = this._thisDoc ? this._thisDoc + "#_g" : RDFSink_uniqueURI()), this._formula = null == e ? this._thisDoc ? t.formula(r + "#_formula") : t.formula() : e, this._context = this._formula, this._parentContext = null }

        function i(t, e, r, n, i) { this._str = r.encode("utf-8"), this._str = r, this._i = n, this._why = i, this.lines = e, this._uri = t }

        function o(t, e, r, n, i) { return "Line " + (e + 1) + " of <" + t + ">: Bad syntax: " + i + '\nat: "' + d(r, n, n + 30) + '"' }
        var s = {
                encode: function(t) {
                    t = t.replace(/\r\n/g, "\n");
                    for (var e = "", r = 0; r < t.length; r++) {
                        var n = t.charCodeAt(r);
                        128 > n ? e += String.fromCharCode(n) : n > 127 && 2048 > n ? (e += String.fromCharCode(n >> 6 | 192), e += String.fromCharCode(63 & n | 128)) : (e += String.fromCharCode(n >> 12 | 224), e += String.fromCharCode(n >> 6 & 63 | 128), e += String.fromCharCode(63 & n | 128))
                    }
                    return e
                },
                decode: function(t) {
                    for (var e = "", r = 0; r < t.length;) {
                        var n = t.charCodeAt(r);
                        128 > n ? (e += String.fromCharCode(n), r++) : n > 191 && 224 > n ? (e += String.fromCharCode((31 & n) << 6 | 63 & t.charCodeAt(r + 1)), r += 2) : (e += String.fromCharCode((15 & n) << 12 | (63 & t.charCodeAt(r + 1)) << 6 | 63 & t.charCodeAt(r + 2)), r += 3)
                    }
                    return e
                }
            },
            a = "http://www.w3.org/2000/10/swap/log#",
            l = function(t) { return t },
            h = function(t) { return t },
            u = function(t) { if (t.length > 0) throw "missing.js: oops nnonempty dict not imp"; return [] },
            c = function(t) { return t.length },
            d = function(t, e, r) { if ("undefined" == typeof t.slice) throw "@@ mising.js: No .slice function for " + t + " of type " + typeof t; return "undefined" == typeof r || null == r ? t.slice(e) : t.slice(e, r) },
            f = Error("dummy error stop iteration"),
            p = function(t) { return this.last = 0, this.li = t, this.next = function() { if (this.last == this.li.length) throw f; return this.li[this.last++] }, this },
            m = function(t, e) { return t.indexOf(e) },
            y = function(t, e) { if (!t) { if (e) throw "python Assertion failed: " + e; throw "(python) Assertion failed." } },
            v = function(t) { return String.fromCharCode(t) };
        String.prototype.encode = function(t) { if ("utf-8" != t) throw "UTF8_converter: can only do utf-8"; return s.encode(this) }, String.prototype.decode = function(t) { if ("utf-8" != t) throw "UTF8_converter: can only do utf-8"; return this };
        var g = function(t, r) { return e.Util.uri.join(r, t) },
            w = null,
            b = 0,
            x = 0,
            T = function() {},
            N = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
            S = "http://www.w3.org/2002/07/owl#sameAs",
            _ = "#",
            k = "http://www.w3.org/2001/XMLSchema#integer",
            R = "http://www.w3.org/2001/XMLSchema#double",
            F = "http://www.w3.org/2001/XMLSchema#decimal",
            I = "http://www.w3.org/2001/XMLSchema#date",
            O = "http://www.w3.org/2001/XMLSchema#dateTime",
            D = "	\r\n !\"#$%&'()*.,+/;<=>?@[\\]^`{|}~",
            C = D + ":",
            L = (new RegExp("^[ \\t]*(#[^\\n]*)?\\r?\\n", "g"), new RegExp("^[ \\t]*(#[^\\n]*)?$", "g"), new RegExp("^[ \\t]*", "g"), new RegExp("^[-+]?[0-9]+", "g"), new RegExp("^([-+]?[0-9]+)(\\.[0-9]+)?(e[-+]?[0-9]+)?", "g")),
            A = new RegExp("^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9](T[0-9][0-9]:[0-9][0-9](:[0-9][0-9](\\.[0-9]*)?)?)?Z?"),
            q = (new RegExp("^[0-9]+", "g"), new RegExp('[\\\\\\r\\n\\"]', "g")),
            j = new RegExp("^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)?", "g");
        return n.prototype.here = function(t) { return this._genPrefix + "_L" + this.lines + "C" + (t - this.startOfLine + 1) }, n.prototype.formula = function() { return this._formula }, n.prototype.loadStream = function(t) { return this.loadBuf(t.read()) }, n.prototype.loadBuf = function(t) { return this.startDoc(), this.feed(t), this.endDoc() }, n.prototype.feed = function(t) { for (var e = t.decode("utf-8"), r = 0; r >= 0;) { var n = this.skipSpace(e, r); if (0 > n) return; var r = this.directiveOrStatement(e, n); if (0 > r) throw o(this._thisDoc, this.lines, e, n, "expected directive or statement") } }, n.prototype.directiveOrStatement = function(t, e) { var r = this.skipSpace(t, e); if (0 > r) return r; var n = this.directive(t, r); if (n >= 0) return this.checkDot(t, n); var n = this.statement(t, r); return n >= 0 ? this.checkDot(t, n) : n }, n.prototype.tok = function(t, r, n) {
            if ("@" == d(r, n, n + 1)) var n = n + 1;
            else if (e.Util.ArrayIndexOf(this.keywords, t) < 0) return -1;
            var i = n + c(t);
            return d(r, n, i) == t && D.indexOf(r.charAt(i)) >= 0 ? i : -1
        }, n.prototype.directive = function(r, n) {
            var i = this.skipSpace(r, n);
            if (0 > i) return i;
            var s = new h([]),
                i = this.tok("bind", r, n);
            if (i > 0) throw o(this._thisDoc, this.lines, r, n, "keyword bind is obsolete: use @prefix");
            var i = this.tok("keywords", r, n);
            if (i > 0) { var n = this.commaSeparatedList(r, i, s, !1); if (0 > n) throw o(this._thisDoc, this.lines, r, n, "'@keywords' needs comma separated list of words"); return this.setKeywords(d(s, null, null)), x > 80 && T("Keywords ", this.keywords), n }
            var i = this.tok("forAll", r, n);
            if (i > 0) {
                var n = this.commaSeparatedList(r, i, s, !0);
                if (0 > n) throw o(this._thisDoc, this.lines, r, n, "Bad variable list after @forAll");
                var a = new p(s);
                try {
                    for (;;) {
                        var l = a.next();
                        (e.Util.ArrayIndexOf(this._variables, l) < 0 || e.Util.ArrayIndexOf(this._parentVariables, l) >= 0) && (this._variables[l] = this._context.newUniversal(l))
                    }
                } catch (u) { if (u != f) throw u }
                return n
            }
            var i = this.tok("forSome", r, n);
            if (i > 0) {
                var n = this.commaSeparatedList(r, i, s, this.uri_ref2);
                if (0 > n) throw o(this._thisDoc, this.lines, r, n, "Bad variable list after @forSome");
                var a = new p(s);
                try {
                    for (;;) {
                        var l = a.next();
                        this._context.declareExistential(l)
                    }
                } catch (u) { if (u != f) throw u }
                return n
            }
            var i = this.tok("prefix", r, n);
            if (i >= 0) {
                var c = new h([]),
                    n = this.qname(r, i, c);
                if (0 > n) throw o(this._thisDoc, this.lines, r, i, "expected qname after @prefix");
                var i = this.uri_ref2(r, n, c);
                if (0 > i) throw o(this._thisDoc, this.lines, r, n, "expected <uriref> after @prefix _qname_");
                var m = c[1].uri;
                if (this._baseURI) var m = g(this._baseURI, m);
                else y(m.indexOf(":") >= 0, "With no base URI, cannot handle relative URI for NS");
                return y(m.indexOf(":") >= 0), this._bindings[c[0][0]] = m, this.bind(c[0][0], t(m)), i
            }
            var i = this.tok("base", r, n);
            if (i >= 0) {
                var c = new h([]),
                    n = this.uri_ref2(r, i, c);
                if (0 > n) throw o(this._thisDoc, this.lines, r, i, "expected <uri> after @base ");
                var m = c[0].uri;
                if (!this._baseURI) throw o(this._thisDoc, this.lines, r, i, "With no previous base URI, cannot use relative URI in @base  <" + m + ">");
                var m = g(this._baseURI, m);
                return y(m.indexOf(":") >= 0), this._baseURI = m, n
            }
            return -1
        }, n.prototype.bind = function(t, e) { "" == t || this._store.setPrefixForURI(t, e) }, n.prototype.setKeywords = function(t) { null == t ? this.keywordsSet = 0 : (this.keywords = t, this.keywordsSet = 1) }, n.prototype.startDoc = function() {}, n.prototype.endDoc = function() { return this._formula }, n.prototype.makeStatement = function(t) { t[0].add(t[2], t[1], t[3], this.source), this.statementCount += 1 }, n.prototype.statement = function(t, e) {
            var r = new h([]),
                e = this.object(t, e, r);
            if (0 > e) return e;
            var n = this.property_list(t, e, r[0]);
            if (0 > n) throw o(this._thisDoc, this.lines, t, e, "expected propertylist");
            return n
        }, n.prototype.subject = function(t, e, r) { return this.item(t, e, r) }, n.prototype.verb = function(t, e, r) {
            var n = this.skipSpace(t, e);
            if (0 > n) return n;
            var i = new h([]),
                n = this.tok("has", t, e);
            if (n >= 0) { var e = this.prop(t, n, i); if (0 > e) throw o(this._thisDoc, this.lines, t, n, "expected property after 'has'"); return r.push(new l(["->", i[0]])), e }
            var n = this.tok("is", t, e);
            if (n >= 0) {
                var e = this.prop(t, n, i);
                if (0 > e) throw o(this._thisDoc, this.lines, t, n, "expected <property> after 'is'");
                var n = this.skipSpace(t, e);
                if (0 > n) throw o(this._thisDoc, this.lines, t, e, "End of file found, expected property after 'is'");
                var e = n,
                    n = this.tok("of", t, e);
                if (0 > n) throw o(this._thisDoc, this.lines, t, e, "expected 'of' after 'is' <prop>");
                return r.push(new l(["<-", i[0]])), n
            }
            var n = this.tok("a", t, e);
            if (n >= 0) return r.push(new l(["->", this._store.sym(N)])), n;
            if ("<=" == d(t, e, e + 2)) return r.push(new l(["<-", this._store.sym(a + "implies")])), e + 2;
            if ("=" == d(t, e, e + 1)) return ">" == d(t, e + 1, e + 2) ? (r.push(new l(["->", this._store.sym(a + "implies")])), e + 2) : (r.push(new l(["->", this._store.sym(S)])), e + 1);
            if (":=" == d(t, e, e + 2)) return r.push(new l(["->", a + "becomes"])), e + 2;
            var n = this.prop(t, e, i);
            if (n >= 0) return r.push(new l(["->", i[0]])), n;
            if (">-" == d(t, e, e + 2) || "<-" == d(t, e, e + 2)) throw o(this._thisDoc, this.lines, t, n, ">- ... -> syntax is obsolete.");
            return -1
        }, n.prototype.prop = function(t, e, r) { return this.item(t, e, r) }, n.prototype.item = function(t, e, r) { return this.path(t, e, r) }, n.prototype.blankNode = function(t) { return this._context.bnode(t, this._reason2) }, n.prototype.path = function(t, e, r) {
            var n = this.nodeOrLiteral(t, e, r);
            if (0 > n) return n;
            for (;
                "!^.".indexOf(d(t, n, n + 1)) >= 0;) {
                var i = d(t, n, n + 1);
                if ("." == i) { var s = d(t, n + 1, n + 2); if (!s || C.indexOf(s) >= 0 && ":?<[{(".indexOf(s) < 0) break }
                var a = r.pop(),
                    h = this.blankNode(this.here(n)),
                    n = this.node(t, n + 1, r);
                if (0 > n) throw o(this._thisDoc, this.lines, t, n, "EOF found in middle of path syntax");
                var u = r.pop();
                this.makeStatement("^" == i ? new l([this._context, u, h, a]) : new l([this._context, u, a, h])), r.push(h)
            }
            return n
        }, n.prototype.anonymousNode = function(t) { var e = this._anonymousNodes[t]; if (e) return e; var e = this._store.bnode(this._context, this._reason2); return this._anonymousNodes[t] = e, e }, n.prototype.node = function(t, e, r, n) {
            "undefined" == typeof n && (n = null);
            var i = n,
                s = this.skipSpace(t, e);
            if (0 > s) return s;
            var e = s,
                a = d(t, e, e + 1);
            if ("[" == a) {
                var m = this.here(e),
                    s = this.skipSpace(t, e + 1);
                if (0 > s) throw o(this._thisDoc, this.lines, t, e, "EOF after '['");
                if ("=" == d(t, s, s + 1)) {
                    var e = s + 1,
                        y = new h([]),
                        s = this.objectList(t, e, y);
                    if (!(s >= 0)) throw o(this._thisDoc, this.lines, t, e, "objectList expected after [= ");
                    var i = y[0];
                    if (c(y) > 1) {
                        var v = new p(y);
                        try {
                            for (;;) {
                                var g = v.next();
                                this.makeStatement(new l([this._context, this._store.sym(S), i, g]))
                            }
                        } catch (b) { if (b != f) throw b }
                    }
                    var s = this.skipSpace(t, s);
                    if (0 > s) throw o(this._thisDoc, this.lines, t, e, "EOF when objectList expected after [ = ");
                    if (";" == d(t, s, s + 1)) var s = s + 1
                }
                if (null == i) var i = this.blankNode(m);
                var e = this.property_list(t, s, i);
                if (0 > e) throw o(this._thisDoc, this.lines, t, s, "property_list expected");
                var s = this.skipSpace(t, e);
                if (0 > s) throw o(this._thisDoc, this.lines, t, e, "EOF when ']' expected after [ <propertyList>");
                if ("]" != d(t, s, s + 1)) throw o(this._thisDoc, this.lines, t, s, "']' expected");
                return r.push(i), s + 1
            }
            if ("{" == a) {
                var x = d(t, e + 1, e + 2);
                if ("$" == x) {
                    e += 1;
                    for (var s = e + 1, T = new h([]), N = !0;;) {
                        var e = this.skipSpace(t, s);
                        if (0 > e) throw o(this._thisDoc, this.lines, t, e, "needed '$}', found end.");
                        if ("$}" == d(t, e, e + 2)) { var s = e + 2; break }
                        if (N) var N = !1;
                        else {
                            if ("," != d(t, e, e + 1)) throw o(this._thisDoc, this.lines, t, e, "expected: ','");
                            e += 1
                        }
                        var _ = new h([]),
                            s = this.item(t, e, _);
                        if (0 > s) throw o(this._thisDoc, this.lines, t, e, "expected item in set or '$}'");
                        T.push(_[0])
                    }
                    return r.push(this._store.newSet(T, this._context)), s
                }
                var s = e + 1,
                    k = this._parentContext;
                this._parentContext = this._context;
                var R = this._anonymousNodes,
                    F = this._parentVariables;
                this._parentVariables = this._variables, this._anonymousNodes = new u([]), this._variables = this._variables.slice();
                var I = this._reason2;
                if (this._reason2 = w, null == i) var i = this._store.formula();
                for (this._context = i;;) { var e = this.skipSpace(t, s); if (0 > e) throw o(this._thisDoc, this.lines, t, e, "needed '}', found end."); if ("}" == d(t, e, e + 1)) { var s = e + 1; break } var s = this.directiveOrStatement(t, e); if (0 > s) throw o(this._thisDoc, this.lines, t, e, "expected statement or '}'") }
                return this._anonymousNodes = R, this._variables = this._parentVariables, this._parentVariables = F, this._context = this._parentContext, this._reason2 = I, this._parentContext = k, r.push(i.close()), s
            }
            if ("(" == a) {
                var O = this._store.list,
                    x = d(t, e + 1, e + 2);
                if ("$" == x) {
                    var O = this._store.newSet;
                    e += 1
                }
                for (var s = e + 1, T = new h([]);;) {
                    var e = this.skipSpace(t, s);
                    if (0 > e) throw o(this._thisDoc, this.lines, t, e, "needed ')', found end.");
                    if (")" == d(t, e, e + 1)) { var s = e + 1; break }
                    var _ = new h([]),
                        s = this.item(t, e, _);
                    if (0 > s) throw o(this._thisDoc, this.lines, t, e, "expected item in list or ')'");
                    T.push(_[0])
                }
                return r.push(O(T, this._context)), s
            }
            var s = this.tok("this", t, e);
            if (s >= 0) throw o(this._thisDoc, this.lines, t, e, "Keyword 'this' was ancient N3. Now use @forSome and @forAll keywords.");
            var s = this.tok("true", t, e);
            if (s >= 0) return r.push(!0), s;
            var s = this.tok("false", t, e);
            if (s >= 0) return r.push(!1), s;
            if (null == i) { var s = this.uri_ref2(t, e, r); if (s >= 0) return s }
            return -1
        }, n.prototype.property_list = function(t, e, r) {
            for (;;) {
                var n = this.skipSpace(t, e);
                if (0 > n) throw o(this._thisDoc, this.lines, t, e, "EOF found when expected verb in property list");
                if (":-" != d(t, n, n + 2)) {
                    var e = n,
                        i = new h([]),
                        n = this.verb(t, e, i);
                    if (0 >= n) return e;
                    var s = new h([]),
                        e = this.objectList(t, n, s);
                    if (0 > e) throw o(this._thisDoc, this.lines, t, n, "objectList expected");
                    var a = new p(s);
                    try {
                        for (;;) {
                            var u = a.next(),
                                c = i[0],
                                m = c[0],
                                y = c[1];
                            this.makeStatement("->" == m ? new l([this._context, y, r, u]) : new l([this._context, y, u, r]))
                        }
                    } catch (v) { if (v != f) throw v }
                    var n = this.skipSpace(t, e);
                    if (0 > n) throw o(this._thisDoc, this.lines, t, n, "EOF found in list of objects");
                    if (";" != d(t, e, e + 1)) return e;
                    var e = e + 1
                } else {
                    var e = n + 2,
                        g = new h([]),
                        n = this.node(t, e, g, r);
                    if (0 > n) throw o(this._thisDoc, this.lines, t, e, "bad {} or () or [] node after :- ");
                    var e = n
                }
            }
        }, n.prototype.commaSeparatedList = function(t, e, r, n) {
            var i = this.skipSpace(t, e);
            if (0 > i) throw o(this._thisDoc, this.lines, t, i, "EOF found expecting comma sep list");
            if ("." == t.charAt(i)) return e;
            if (n) var i = this.uri_ref2(t, i, r);
            else var i = this.bareWord(t, i, r);
            if (0 > i) return -1;
            for (;;) {
                var e = this.skipSpace(t, i);
                if (0 > e) return e;
                var s = d(t, e, e + 1);
                if ("," != s) return "." != s ? -1 : e;
                if (n) var i = this.uri_ref2(t, e + 1, r);
                else var i = this.bareWord(t, e + 1, r);
                if (0 > i) throw o(this._thisDoc, this.lines, t, i, "bad list content")
            }
        }, n.prototype.objectList = function(t, e, r) { var e = this.object(t, e, r); if (0 > e) return -1; for (;;) { var n = this.skipSpace(t, e); if (0 > n) throw o(this._thisDoc, this.lines, t, n, "EOF found after object"); if ("," != d(t, n, n + 1)) return n; var e = this.object(t, n + 1, r); if (0 > e) return e } }, n.prototype.checkDot = function(t, e) { var r = this.skipSpace(t, e); if (0 > r) return r; if ("." == d(t, r, r + 1)) return r + 1; if ("}" == d(t, r, r + 1)) return r; if ("]" == d(t, r, r + 1)) return r; throw o(this._thisDoc, this.lines, t, r, "expected '.' or '}' or ']' at end of statement") }, n.prototype.uri_ref2 = function(t, r, n) {
            var i = new h([]),
                s = this.qname(t, r, i);
            if (s >= 0) {
                var a = i[0],
                    l = a[0],
                    u = a[1];
                if (null == l) { y(0, "not used?"); var f = this._baseURI + _ } else { var f = this._bindings[l]; if (!f) { if ("_" == l) return n.push(this.anonymousNode(u)), s; throw o(this._thisDoc, this.lines, t, r, "Prefix " + l + " not bound.") } }
                var p = this._store.sym(f + u);
                return n.push(e.Util.ArrayIndexOf(this._variables, p) >= 0 ? this._variables[p] : p), s
            }
            var r = this.skipSpace(t, r);
            if (0 > r) return -1;
            if ("?" == t.charAt(r)) {
                var m = new h([]),
                    s = this.variable(t, r, m);
                return s > 0 ? (n.push(m[0]), s) : -1
            }
            if ("<" == t.charAt(r)) {
                for (var r = r + 1, v = r; r < c(t);) {
                    if (">" == t.charAt(r)) {
                        var w = d(t, v, r);
                        if (this._baseURI) var w = g(this._baseURI, w);
                        else y(w.indexOf(":") >= 0, "With no base URI, cannot deal with relative URIs");
                        if ("#" == d(t, r - 1, r) && "#" != d(w, -1, null)) var w = w + "#";
                        var p = this._store.sym(w);
                        return n.push(e.Util.ArrayIndexOf(this._variables, p) >= 0 ? this._variables[p] : p), r + 1
                    }
                    var r = r + 1
                }
                throw o(this._thisDoc, this.lines, t, s, "unterminated URI reference")
            }
            if (this.keywordsSet) {
                var m = new h([]),
                    s = this.bareWord(t, r, m);
                if (0 > s) return -1;
                if (e.Util.ArrayIndexOf(this.keywords, m[0]) >= 0) throw o(this._thisDoc, this.lines, t, r, 'Keyword "' + m[0] + '" not allowed here.');
                return n.push(this._store.sym(this._bindings[""] + m[0])), s
            }
            return -1
        }, n.prototype.skipSpace = function(t, e) { for (var r = " \n\r	\f            ​\u2028\u2029　", n = e ? e : 0; n < t.length; n++) { var i = t.charAt(n); if (r.indexOf(i) < 0) { if ("#" !== t.charAt(n)) return n; for (;; n++) { if (n === t.length) return -1; if ("\n" === t.charAt(n)) { this.lines = this.lines + 1; break } } } else "\n" === t.charAt(n) && (this.lines = this.lines + 1) } return -1 }, n.prototype.variable = function(t, e, r) {
            var n = this.skipSpace(t, e);
            if (0 > n) return -1;
            if ("?" != d(t, n, n + 1)) return -1;
            var n = n + 1,
                e = n;
            if ("0123456789-".indexOf(t.charAt(n)) >= 0) throw o(this._thisDoc, this.lines, t, n, "Varible name can't start with '" + t.charAt(n) + "s'");
            for (; e < c(t) && C.indexOf(t.charAt(e)) < 0;) var e = e + 1;
            if (null == this._parentContext) throw o(this._thisDoc, this.lines, t, n, "Can't use ?xxx syntax for variable in outermost level: " + d(t, n - 1, e));
            return r.push(this._store.variable(d(t, n, e))), e
        }, n.prototype.bareWord = function(t, e, r) { var n = this.skipSpace(t, e); if (0 > n) return -1; var i = t.charAt(n); if ("0123456789-".indexOf(i) >= 0) return -1; if (C.indexOf(i) >= 0) return -1; for (var e = n; e < c(t) && C.indexOf(t.charAt(e)) < 0;) var e = e + 1; return r.push(d(t, n, e)), e }, n.prototype.qname = function(t, r, n) {
            var r = this.skipSpace(t, r);
            if (0 > r) return -1;
            var i = t.charAt(r);
            if ("0123456789-+".indexOf(i) >= 0) return -1;
            if (C.indexOf(i) < 0)
                for (var o = i, r = r + 1; r < c(t);) {
                    var i = t.charAt(r);
                    if (!(C.indexOf(i) < 0)) break;
                    var o = o + i,
                        r = r + 1
                } else var o = "";
            if (r < c(t) && ":" == t.charAt(r)) {
                for (var s = o, r = r + 1, o = ""; r < c(t);) {
                    var i = t.charAt(r);
                    if (!(C.indexOf(i) < 0)) break;
                    var o = o + i,
                        r = r + 1
                }
                return n.push(new l([s, o])), r
            }
            return o && this.keywordsSet && e.Util.ArrayIndexOf(this.keywords, o) < 0 ? (n.push(new l(["", o])), r) : -1
        }, n.prototype.object = function(t, e, r) {
            var n = this.subject(t, e, r);
            if (n >= 0) return n;
            var n = this.skipSpace(t, e);
            if (0 > n) return -1;
            var e = n;
            if ('"' == t.charAt(e)) {
                if ('"""' == d(t, e, e + 3)) var i = '"""';
                else var i = '"';
                var e = e + c(i),
                    o = this.strconst(t, e, i),
                    n = o[0],
                    s = o[1];
                return r.push(this._store.literal(s)), T("New string const ", s, n), n
            }
            return -1
        }, n.prototype.nodeOrLiteral = function(t, e, r) {
            var n = this.node(t, e, r);
            if (n >= 0) return n;
            var n = this.skipSpace(t, e);
            if (0 > n) return -1;
            var e = n,
                i = t.charAt(e);
            if ("-+0987654321".indexOf(i) >= 0) {
                A.lastIndex = 0;
                var s = A.exec(t.slice(e));
                if (null != s) {
                    var a = s[0];
                    n = e + a.length, r.push(a.indexOf("T") >= 0 ? this._store.literal(a, void 0, this._store.sym(O)) : this._store.literal(a, void 0, this._store.sym(I)))
                } else {
                    L.lastIndex = 0;
                    var s = L.exec(t.slice(e));
                    if (null == s) throw o(this._thisDoc, this.lines, t, e, "Bad number or date syntax");
                    n = e + L.lastIndex;
                    var a = d(t, e, n);
                    r.push(a.indexOf("e") >= 0 ? this._store.literal(parseFloat(a), void 0, this._store.sym(R)) : d(t, e, n).indexOf(".") >= 0 ? this._store.literal(parseFloat(a), void 0, this._store.sym(F)) : this._store.literal(parseInt(a), void 0, this._store.sym(k)))
                }
                return n
            }
            if ('"' == t.charAt(e)) {
                if ('"""' == d(t, e, e + 3)) var l = '"""';
                else var l = '"';
                var e = e + c(l),
                    u = null,
                    f = this.strconst(t, e, l),
                    n = f[0],
                    p = f[1],
                    m = null;
                if ("@" == d(t, n, n + 1)) {
                    j.lastIndex = 0;
                    var s = j.exec(t.slice(n + 1));
                    if (null == s) throw o(this._thisDoc, startline, t, e, "Bad language code syntax on string literal, after @");
                    var e = j.lastIndex + n + 1,
                        m = d(t, n + 1, e),
                        n = e
                }
                if ("^^" == d(t, n, n + 2)) var y = new h([]),
                    n = this.uri_ref2(t, n + 2, y),
                    u = y[0];
                return r.push(this._store.literal(p, m, u)), n
            }
            return -1
        }, n.prototype.strconst = function(t, e, r) {
            for (var n = e, i = "", s = this.lines; n < c(t);) {
                var e = n + c(r);
                if (d(t, n, e) == r) return new l([e, i]);
                if ('"' != t.charAt(n)) {
                    q.lastIndex = 0;
                    var a = q.exec(t.slice(n));
                    if (!a) throw o(this._thisDoc, s, t, n, "Closing quote missing in string at ^ in " + d(t, n - 20, n) + "^" + d(t, n, n + 20));
                    var e = n + q.lastIndex - 1,
                        i = i + d(t, n, e),
                        h = t.charAt(e);
                    if ('"' != h)
                        if ("\r" != h) {
                            if ("\n" == h) {
                                if ('"' == r) throw o(this._thisDoc, s, t, e, "newline found in string literal");
                                this.lines = this.lines + 1;
                                var i = i + h,
                                    n = e + 1;
                                this.previousLine = this.startOfLine, this.startOfLine = n
                            } else if ("\\" == h) {
                                var n = e + 1,
                                    h = d(t, n, n + 1);
                                if (!h) throw o(this._thisDoc, s, t, e, "unterminated string literal (2)");
                                var u = m('abfrtvn\\"', h);
                                if (u >= 0) var f = 'a\b\f\r	\n\\"'.charAt(u),
                                    i = i + f,
                                    n = n + 1;
                                else if ("u" == h) var p = this.uEscape(t, n + 1, s),
                                    n = p[0],
                                    h = p[1],
                                    i = i + h;
                                else {
                                    if ("U" != h) throw o(this._thisDoc, this.lines, t, e, "bad escape");
                                    var p = this.UEscape(t, n + 1, s),
                                        n = p[0],
                                        h = p[1],
                                        i = i + h
                                }
                            }
                        } else var n = e + 1;
                    else var n = e
                } else var i = i + '"',
                    n = n + 1
            }
            throw o(this._thisDoc, this.lines, t, e, "unterminated string literal")
        }, n.prototype.uEscape = function(t, e, r) {
            for (var n = e, i = 0, s = 0; 4 > i;) {
                var a = d(t, n, n + 1),
                    h = a.toLowerCase(),
                    n = n + 1;
                if ("" == h) throw o(this._thisDoc, r, t, e, "unterminated string literal(3)");
                var u = m("0123456789abcdef", h);
                if (0 > u) throw o(this._thisDoc, r, t, e, "bad string literal hex escape");
                var s = 16 * s + u,
                    i = i + 1
            }
            var c = String.fromCharCode(s);
            return new l([n, c])
        }, n.prototype.UEscape = function(t, e, r) {
            for (var n = e, i = 0, s = "\\U"; 8 > i;) {
                var a = d(t, n, n + 1),
                    h = a.toLowerCase(),
                    n = n + 1;
                if ("" == h) throw o(this._thisDoc, r, t, e, "unterminated string literal(3)");
                var u = m("0123456789abcdef", h);
                if (0 > u) throw o(this._thisDoc, r, t, e, "bad string literal hex escape");
                var s = s + h,
                    i = i + 1
            }
            var c = v("0x" + d(s, 2, 10) - 0);
            return new l([n, c])
        }, i.prototype.toString = function() {
            var t = this._str,
                e = this._i,
                r = 0;
            if (e > 60) var n = "...",
                r = e - 60;
            else var n = "";
            if (c(t) - e > 60) var i = "...";
            else var i = "";
            return 'Line %i of <%s>: Bad syntax (%s) at ^ in:\n"%s%s^%s%s"' % new l([this.lines + 1, this._uri, this._why, n, d(t, r, e), d(t, e, e + 60), i])
        }, r
    }(), e.IndexedFormula = function() {
        var t = "http://www.w3.org/2002/07/owl#";
        return e.Literal.prototype.hashString = e.Literal.prototype.toNT, e.Symbol.prototype.hashString = e.Symbol.prototype.toNT, e.BlankNode.prototype.hashString = e.BlankNode.prototype.toNT, e.Collection.prototype.hashString = e.Collection.prototype.toNT, e.IndexedFormula = function(r) {
            function n(t, e, r, n, i) {
                void 0 != t.typeCallback && t.typeCallback(t, n, i);
                var o = t.classActions[n.hashString()],
                    s = !1;
                if (o)
                    for (var a = 0; a < o.length; a++) s = s || o[a](t, e, r, n, i);
                return s
            }

            function i(t, e, r, n) { var i = t.any(void 0, r, n); return void 0 == i ? !1 : (t.equate(i, e), !0) }

            function o(t, e, r, n) { var i = t.any(e, r, void 0); return void 0 == i ? !1 : (t.equate(i, n), !0) }
            this.statements = [], this.optional = [], this.propertyActions = [], this.classActions = [], this.redirections = [], this.aliases = [], this.HTTPRedirects = [], this.subjectIndex = [], this.predicateIndex = [], this.objectIndex = [], this.whyIndex = [], this.index = [this.subjectIndex, this.predicateIndex, this.objectIndex, this.whyIndex], this.namespaces = {}, void 0 === r && (r = ["sameAs", "InverseFunctionalProperty", "FunctionalProperty"]), this.propertyActions["<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>"] = [n], e.Util.ArrayIndexOf(r, "sameAs") >= 0 && (this.propertyActions["<http://www.w3.org/2002/07/owl#sameAs>"] = [function(t, e, r, n) { return t.equate(e, n), !0 }]), e.Util.ArrayIndexOf(r, "InverseFunctionalProperty") >= 0 && (this.classActions["<" + t + "InverseFunctionalProperty>"] = [function(t, e) { return t.newPropertyAction(e, i) }]), e.Util.ArrayIndexOf(r, "FunctionalProperty") >= 0 && (this.classActions["<" + t + "FunctionalProperty>"] = [function(t, e) { return t.newPropertyAction(e, o) }])
        }, e.IndexedFormula.prototype = new e.Formula, e.IndexedFormula.prototype.constructor = e.IndexedFormula, e.IndexedFormula.SuperClass = e.Formula, e.IndexedFormula.prototype.newPropertyAction = function(t, e) {
            var r = t.hashString();
            void 0 == this.propertyActions[r] && (this.propertyActions[r] = []), this.propertyActions[r].push(e);
            for (var n = this.statementsMatching(void 0, t, void 0), i = !1, o = 0; o < n.length; o++) i = i || e(this, n[o].subject, t, n[o].object);
            return i
        }, e.IndexedFormula.prototype.setPrefixForURI = function(t, e) { "tab" == t && this.namespaces.tab || "ns" !== t.slice(0, 2) && "default" !== t.slice(0, 7) && (this.namespaces[t] = e) }, e.IndexedFormula.prototype.register = function(t, e) { this.namespaces[t] = e }, e.IndexedFormula.prototype.equate = function(t, e) { t = this.canon(t), e = this.canon(e); var r = t.compareTerm(e); if (!r) return !0; return 0 > r ? this.replaceWith(e, t) : this.replaceWith(t, e) }, e.IndexedFormula.prototype.replaceWith = function(t, e) {
            for (var r = t.hashString(), n = e.hashString(), i = function(t) {
                    var e = t[r];
                    if (void 0 != e) {
                        var i = t[n];
                        t[n] = void 0 == i ? e : e.concat(i), delete t[r]
                    }
                }, o = 0; 4 > o; o++) i(this.index[o]);
            if (this.redirections[r] = e, t.uri) {
                if (void 0 == this.aliases[n] && (this.aliases[n] = []), this.aliases[n].push(t), this.aliases[r])
                    for (var o = 0; o < this.aliases[r].length; o++) this.redirections[this.aliases[r][o].hashString()] = e, this.aliases[n].push(this.aliases[r][o]);
                this.add(e, this.sym("http://www.w3.org/2007/ont/link#uri"), t.uri), this.fetcher && this.fetcher.nowKnownAs(t, e)
            }
            return i(this.classActions), i(this.propertyActions), !0
        }, e.IndexedFormula.prototype.canon = function(t) { if (void 0 == t) return t; var e = this.redirections[t.hashString()]; return void 0 == e ? t : e }, e.IndexedFormula.prototype.sameThings = function(t, e) { if (t.sameTerm(e)) return !0; var r = this.canon(t); if (void 0 == r) return !1; var n = this.canon(e); return void 0 == n ? !1 : r.uri == n.uri }, e.IndexedFormula.prototype.uris = function(t) {
            var e = this.canon(t),
                r = this.aliases[e.hashString()];
            if (!e.uri) return [];
            var n = [e.uri];
            if (void 0 != r)
                for (var i = 0; i < r.length; i++) n.push(r[i].uri);
            return n
        }, e.IndexedFormula.prototype.add = function(t, r, n, i) {
            var o, s;
            void 0 == i && (i = this.fetcher ? this.fetcher.appNode : this.sym("chrome:theSession")), t = e.term(t), r = e.term(r), n = e.term(n), i = e.term(i), void 0 != this.predicateCallback && this.predicateCallback(this, r, i);
            var a = this.canon(r).hashString(),
                o = this.propertyActions[a],
                l = !1;
            if (o)
                for (var h = 0; h < o.length; h++) l = l || o[h](this, t, r, n, i);
            for (var u = [this.canon(t).hashString(), a, this.canon(n).hashString(), this.canon(i).hashString()], s = new e.Statement(t, r, n, i), h = 0; 4 > h; h++) {
                var c = this.index[h],
                    d = u[h];
                void 0 == c[d] && (c[d] = []), c[d].push(s)
            }
            return this.statements.push(s), s
        }, e.IndexedFormula.prototype.mentionsURI = function(t) { var e = "<" + t + ">"; return !!this.subjectIndex[e] || !!this.objectIndex[e] || !!this.predicateIndex[e] }, e.IndexedFormula.prototype.nextSymbol = function(t) { for (var e = 0;; e++) { var r = t.uri + "#n" + e; if (!this.mentionsURI(r)) return this.sym(r) } }, e.IndexedFormula.prototype.anyStatementMatching = function(t, e, r, n) { var i = this.statementsMatching(t, e, r, n, !0); return i && i != [] ? i[0] : void 0 }, e.IndexedFormula.prototype.statementsMatching = function(t, r, n, i, o) {
            for (var s = [t, r, n, i], a = [], l = [], h = [], u = [], c = 0; 4 > c; c++) a[c] = this.canon(e.term(s[c])), void 0 == a[c] ? h.push(c) : (u.push(c), l[c] = a[c].hashString());
            if (0 == u.length) return this.statements;
            if (1 == u.length) {
                var c = u[0],
                    d = this.index[c][l[c]];
                return d && o && d.length > 1 && (d = d.slice(0, 1)), void 0 == d ? [] : d
            }
            for (var f, p = 1e10, m = 0; m < u.length; m++) {
                var c = u[m],
                    d = this.index[c][l[c]];
                if (void 0 == d) return [];
                d.length < p && (p = d.length, f = m)
            }
            for (var y = u[f], v = this.index[y][l[y]], g = u.slice(0, f).concat(u.slice(f + 1)), w = [], b = ["subject", "predicate", "object", "why"], x = 0; x < v.length; x++) { for (var T = v[x], m = 0; m < g.length; m++) { var c = g[m]; if (!this.canon(T[b[c]]).sameTerm(a[c])) { T = null; break } } if (null != T && (w.push(T), o)) break }
            return w
        }, e.IndexedFormula.prototype.remove = function(t) {
            for (var r = [t.subject, t.predicate, t.object, t.why], n = 0; 4 > n; n++) {
                var i = this.canon(r[n]),
                    o = i.hashString();
                void 0 == this.index[n][o] || e.Util.RDFArrayRemove(this.index[n][o], t)
            }
            e.Util.RDFArrayRemove(this.statements, t)
        }, e.IndexedFormula.prototype.checkStatementList = function(t, e) {
            for (var r = ["subject", "predicate", "object", "why"], n = " found in " + r[e] + " index.", i = 0; i < t.length; i++) {
                st = t[i];
                for (var o = [st.subject, st.predicate, st.object, st.why], s = function(t, e) {
                        for (var r = 0; r < t.length; r++)
                            if (t[r].subject.sameTerm(e.subject) && t[r].predicate.sameTerm(e.predicate) && t[r].object.sameTerm(e.object) && t[r].why.sameTerm(e.why)) return !0
                    }, a = 0; 4 > a; a++) {
                    var l = this.canon(o[a]),
                        h = l.hashString();
                    if (void 0 == this.index[a][h]) throw new Error("No " + name[a] + " index for statement " + st + "@" + st.why + n);
                    if (!s(this.index[a][h], st)) throw new Error("Index for " + name[a] + " does not have statement " + st + "@" + st.why + n)
                }
                if (!s(this.statements, st)) throw new Error("Statement list does not statement " + st + "@" + st.why + n)
            }
        }, e.IndexedFormula.prototype.check = function() { this.checkStatementList(this.statements); for (var t = 0; 4 > t; t++) { var e = this.index[t]; for (var r in e) e.hasOwnProperty(r) && this.checkStatementList(e[r], t) } }, e.IndexedFormula.prototype.removeMany = function(t, e, r, n, i) {
            for (var o = this.statementsMatching(t, e, r, n, !1), s = [], a = 0; a < o.length; a++) s.push(o[a]);
            i && (s = s.slice(0, i));
            for (var a = 0; a < s.length; a++) this.remove(s[a])
        }, e.IndexedFormula.prototype.copyTo = function(t, r, n) {
            n || (n = []);
            var i = this.statementsMatching(t); - 1 != e.Util.ArrayIndexOf(n, "two-direction") && i.concat(this.statementsMatching(void 0, void 0, t));
            for (var o = 0; o < i.length; o++) {
                var s = i[o];
                switch (s.object.termType) {
                    case "symbol":
                        this.add(r, s.predicate, s.object);
                        break;
                    case "literal":
                    case "bnode":
                    case "collection":
                        this.add(r, s.predicate, s.object.copy(this))
                } - 1 != e.Util.ArrayIndexOf(n, "delete") && this.remove(s)
            }
        }, e.Literal.prototype.copy = function() { return new e.Literal(this.value, this.lang, this.datatype) }, e.BlankNode.prototype.copy = function(t) { var r = new e.BlankNode; return t.copyTo(this, r), r }, e.IndexedFormula.prototype.newUniversal = function(t) { var e = this.sym(t); return this._universalVariables || (this._universalVariables = []), this._universalVariables.push(e), e }, e.IndexedFormula.prototype.newExistential = function(t) { if (!t) return this.bnode(); var e = this.sym(t); return this.declareExistential(e) }, e.IndexedFormula.prototype.declareExistential = function(t) { return this._existentialVariables || (this._existentialVariables = []), this._existentialVariables.push(t), t }, e.IndexedFormula.prototype.formula = function(t) { return new e.IndexedFormula(t) }, e.IndexedFormula.prototype.close = function() { return this }, e.IndexedFormula.prototype.hashString = e.IndexedFormula.prototype.toNT, e.IndexedFormula
    }(), e.sparqlUpdateParser = function(t, r, n) {
        var i, o, s, a = ["INSERT", "DELETE", "WHERE"],
            l = e.Namespace("http://www.w3.org/ns/pim/patch#"),
            h = e.N3Parser(r, r, n, n, null, null, "", null),
            u = {},
            c = function(t, e, r, n, i) { return "Line " + (e + 1) + " of <" + t + ">: Bad syntax:\n   " + i + '\n   at: "' + r.slice(n, n + 30) + '"' };
        i = 0;
        var d = r.sym(n + "#query");
        for (u.query = d;;) {
            var o = h.skipSpace(t, i);
            if (0 > o) return u;
            if (";" === t[o]) {
                if (i = h.skipSpace(t, o + 1), 0 > i) return u;
                o = i
            }
            var f = !1;
            for (s = 0; s < a.length; s++) {
                var p = a[s];
                if (t.slice(o, o + p.length) === p) {
                    if (i = h.skipSpace(t, o + p.length), 0 > i) throw c(h._thisDoc, h.lines, t, o + p.length, "found EOF, needed {...} after " + p);
                    if (("INSERT" === p || "DELETE" === p) && "DATA" === t.slice(i, i + 4)) {
                        if (o = h.skipSpace(t, i + 4), 0 > o) throw c(h._thisDoc, h.lines, t, i + 4, "needed {...} after INSERT DATA " + p);
                        i = o
                    }
                    var m = [];
                    if (o = h.node(t, i, m), 0 > o) throw c(h._thisDoc, h.lines, t, i, "bad syntax or EOF in {...} after " + p);
                    u[p.toLowerCase()] = m[0], r.add(d, l(p.toLowerCase()), m[0]), f = !0, i = o
                }
            }
            if (!f && "@prefix" === t.slice(o, o + 7)) {
                var i = h.directive(t, o);
                if (0 > i) throw c(h._thisDoc, h.lines, t, i, "bad syntax or EOF after @prefix ");
                i = h.checkDot(t, i), f = !0
            }
            if (!f) throw c(h._thisDoc, h.lines, t, o, "Unknown syntax at start of statememt: '" + t.slice(o).slice(0, 20) + "'")
        }
    }, e.IndexedFormula.prototype.applyPatch = function(t, r, n) {
        var i = this,
            o = function(e) {
                if (t["delete"]) {
                    var o = t["delete"];
                    s && (o = o.substitute(s)), o = o.statements;
                    var a = [],
                        l = o.map(function(t) { var e = i.statementsMatching(t.subject, t.predicate, t.object, r); return 0 === e.length ? (a.push(t), null) : e[0] });
                    if (a.length) return n("Couldn't find to delete: " + a[0]);
                    l.map(function(t) { i.remove(t) })
                }
                if (t.insert) {
                    var o = t.insert;
                    s && (o = o.substitute(s)), o = o.statements, o.map(function(t) { t.why = r, i.add(t.subject, t.predicate, t.object, t.why) })
                }
                e()
            },
            s = null;
        if (t.where) {
            var a = new e.Query("patch");
            a.pat = t.where, a.pat.statements.map(function(t) { t.why = r });
            var l = [];
            i.query(a, function(t) { l.push(t) }, i.fetcher, function() { return 0 == l.length ? n("No match found to be patched:" + t.where) : l.length > 1 ? n("Patch ambiguous. No patch done.") : (s = l[0], void o(n)) })
        } else o(n)
    }, e.Query = function(t, r) { this.pat = new e.IndexedFormula, this.vars = [], this.name = t, this.id = r }, e.QuerySource = function() {
        this.queries = [], this.listeners = [], this.addQuery = function(t) { var e; for ((null === t.name || "" === t.name) && (t.name = "Query #" + (this.queries.length + 1)), t.id = this.queries.length, this.queries.push(t), e = 0; e < this.listeners.length; e++) null !== this.listeners[e] && this.listeners[e].addQuery(t) }, this.removeQuery = function(t) {
            var e;
            for (e = 0; e < this.listeners.length; e++) null !== this.listeners[e] && this.listeners[e].removeQuery(t);
            null !== this.queries[t.id] && delete this.queries[t.id]
        }, this.addListener = function(t) { var e; for (this.listeners.push(t), e = 0; e < this.queries.length; e++) null !== this.queries[e] && t.addQuery(this.queries[e]) }, this.removeListener = function(t) { var e; for (e = 0; e < this.queries.length; e++) null !== this.queries[e] && t.removeQuery(this.queries[e]); for (e = 0; e < this.listeners.length; e++) this.listeners[e] === t && delete this.listeners[e] }
    }, e.Variable.prototype.isVar = 1, e.BlankNode.prototype.isVar = 1, e.BlankNode.prototype.isBlank = 1, e.Symbol.prototype.isVar = 0, e.Literal.prototype.isVar = 0, e.Formula.prototype.isVar = 0, e.Collection.prototype.isVar = 0, e.IndexedFormula.prototype.query = function(t, r, n, i) {
        function o(t, e) { return t.nvars !== e.nvars ? t.nvars - e.nvars : t.index.length - e.index.length }
        var s = function(t) { var e, r = ""; for (e in t) t.hasOwnProperty(e) && (r += "    " + e + " -> " + t[e]); return r },
            a = function(t) {
                var e, r = "Bindings: ",
                    n = t.length;
                for (e = 0; n > e; e++) r += s(t[e][0]) + ";\n	";
                return r
            },
            l = function(t, e, r, n) {
                var i = r[t];
                if (void 0 === i) {
                    if (t.isVar) {
                        var o = [];
                        return o[t] = e, [
                            [o, null]
                        ]
                    }
                    i = t
                }
                if (!i.complexType) return n.redirections[i] && (i = n.redirections[i]), n.redirections[e] && (e = n.redirections[e]), i.sameTerm(e) ? [
                    [
                        [], null
                    ]
                ] : [];
                if (t instanceof Array) return e instanceof Array ? h(t, e, r) : [];
                throw "query.js: oops - code not written yet"
            },
            h = function(t, e, r, n) {
                var i;
                if (t.length !== e.length) return [];
                if (!t.length) return [
                    [
                        [], null
                    ]
                ];
                var o = l(t[0], e[0], r, n);
                if (0 === o.length) return o;
                var s, a, u, c, d, f, p, m = [],
                    y = o.length;
                for (s = 0; y > s; s++) {
                    a = o[s][0], p = [];
                    for (d in a) a.hasOwnProperty(d) && (p[d] = a[d]);
                    for (d in r) r.hasOwnProperty(d) && (p[d] = r[d]);
                    for (i = h(t.slice(1), e.slice(1), p, n), c = i.length, u = 0; c > u; u++) {
                        f = i[u][0];
                        for (d in a) a.hasOwnProperty(d) && (f[d] = a[d]);
                        m.push([f, null])
                    }
                }
                return m
            },
            u = function(t, e) { var r = e[t]; return void 0 === r ? t : r },
            c = function(t, e) { var r, n = {}; for (r in t) t.hasOwnProperty(r) && (n[r] = t[r]); for (r in e) e.hasOwnProperty(r) && (n[r] = e[r]); return n },
            d = function(t, e) { return this.trunkBindings = e, this.originalCallback = t, this.branches = [], this };
        d.prototype.checkAllDone = function() {
            var t;
            for (t = 0; t < this.branches.length; t++)
                if (!this.branches[t].done) return;
            e.log.debug("OPTIONAL BIDNINGS ALL DONE:"), this.doCallBacks(this.branches.length - 1, this.trunkBindings)
        }, d.prototype.doCallBacks = function(t, e) { var r; if (0 > t) return this.originalCallback(e); for (r = 0; r < this.branches[t].results.length; r++) this.doCallBacks(t - 1, c(e, this.branches[t].results[r])) };
        var f = function(t, e) { return this.count = 0, this.success = !1, this.done = !1, this.callback = t, this.onDone = e, this };
        f.prototype.reportMatch = function(t) { this.callback(t), this.success = !0 }, f.prototype.reportDone = function() { this.done = !0, e.log.info("Mandatory query branch finished.***"), void 0 !== this.onDone && this.onDone() };
        var p = function(t) { return this.count = 0, this.done = !1, this.results = [], this.junction = t, t.branches.push(this), this };
        p.prototype.reportMatch = function(t) { this.results.push(t) }, p.prototype.reportDone = function() { e.log.debug("Optional branch finished - results.length = " + this.results.length), 0 === this.results.length && (this.results.push({}), e.log.debug("Optional branch FAILED - that's OK.")), this.done = !0, this.junction.checkAllDone() };
        var m = function(t, e, r) { var n, i, o, s, a; for (e.nvars = 0, e.index = null, i = [e.subject, e.predicate, e.object], a = [t.subjectIndex, t.predicateIndex, t.objectIndex], s = 0; 3 > s; s++) i[s].isVar && void 0 === r[i[s]] ? e.nvars++ : (n = u(i[s], r), t.redirections[n.hashString()] && (n = t.redirections[n.hashString()]), o = a[s], e.index = o[n.hashString()], void 0 === e.index && (e.index = [])); return null === e.index && (e.index = t.statements), !1 },
            y = 0,
            v = function(t, n, i, o, a, l, h) {
                e.log.debug("Match begins, Branch count now: " + h.count + " for " + h.pattern_debug);
                var u = t.fetcher ? t.fetcher : null,
                    c = n.statements;
                if (0 === c.length) {
                    if (e.log.debug("FOUND MATCH WITH BINDINGS:" + s(i)), 0 === n.optional.length) h.reportMatch(i);
                    else {
                        e.log.debug("OPTIONAL: " + n.optional);
                        var f, m = new d(r, i),
                            g = [];
                        for (f = 0; f < n.optional.length; f++) g[f] = new p(m), g[f].pattern_debug = n.optional[f];
                        for (f = 0; f < n.optional.length; f++) g[f].count = g[f].count + 1, v(t, n.optional[f], i, "", a, r, g[f])
                    }
                    return h.count--, void e.log.debug("Match ends -- success , Branch count now: " + h.count + " for " + h.pattern_debug)
                }
                var b, x, T = c.length;
                if (u) {
                    var N = "match" + y++,
                        S = function(e) {
                            var r = e.uri.split("#")[0];
                            u.nowOrWhenFetched(r, void 0, function(r, s) { r && console.log("Error following link to <" + e.uri + "> in query: " + s), v(t, n, i, o, a, l, h) })
                        };
                    for (x = 0; T > x; x++) {
                        if (b = c[x], void 0 !== i[b.subject] && i[b.subject].uri && u && "unrequested" === u.getState(e.Util.uri.docpart(i[b.subject].uri))) return void S(i[b.subject], N);
                        if (void 0 !== i[b.object] && i[b.object].uri && u && "unrequested" === u.getState(e.Util.uri.docpart(i[b.object].uri))) return void S(i[b.object], N)
                    }
                }
                w(t, n, i, o, a, l, h)
            },
            g = function(t, e) { var r, n, i = !0; for (r in t) t.hasOwnProperty(r) && e[r] && (n = e[r].test, n && !n(t[r]) && (i = !1)); return i },
            w = function(t, r, n, i, l, u, c) {
                var d, f, p, y, w, b, x, T = r.statements,
                    N = T.length;
                for (d = 0; N > d; d++) x = T[d], e.log.info("match2: item=" + x + ", bindingsSoFar=" + s(n)), m(t, x, n);
                T.sort(o), x = T[0];
                var S = t.formula();
                S.optional = r.optional, S.constraints = r.constraints, S.statements = T.slice(1), e.log.debug(i + "match2 searching " + x.index.length + " for " + x + "; bindings so far=" + s(n));
                var _, k, R, F = x.index.length,
                    I = 0;
                for (_ = 0; F > _; _++)
                    for (R = x.index[_], k = h([x.subject, x.predicate, x.object], [R.subject, R.predicate, R.object], n, t), e.log.info(i + " From first: " + k.length + ": " + a(k)), p = k.length, f = 0; p > f; f++)
                        if (w = [], b = k[f][0], g(b, r.constraints)) {
                            for (y in b) b.hasOwnProperty(y) && (w[y] = b[y]);
                            for (y in n) n.hasOwnProperty(y) && (w[y] = n[y]);
                            c.count++, I++, v(t, S, w, i + "  ", l, u, c)
                        } else e.log.debug("Branch count CS: " + c.count);
                c.count--, 0 === I && e.log.debug("Match2 fails completely on " + x), e.log.debug("Match2 ends, Branch count: " + c.count + " for " + c.pattern_debug), 0 === c.count && (e.log.debug("Branch finished."), c.reportDone())
            },
            b = this;
        e.log.debug("Query on " + this.statements.length);
        var x = new f(r, i);
        x.count++, setTimeout(function() { v(b, t.pat, t.pat.initBindings, "", n, r, x) }, 0)
    }, e.queryToSPARQL = function(t) {
        function r(t) { var e = l() + "SELECT "; for (i = 0; i < t.vars.length; i++) e += t.vars[i] + " "; return e += "\n" }

        function n(t) {
            var r = "",
                n = t.statements;
            for (var i in n) e.log.debug("Found statement: " + n), r += l() + n[i] + "\n";
            return r
        }

        function o(t) {
            var e = "";
            for (var r in t.constraints) {
                var n = t.constraints[r];
                e += l() + "FILTER ( " + n.describe(r) + " ) \n"
            }
            return e
        }

        function s(t) { for (var r = "", i = 0; i < t.optional.length; i++) e.log.debug("Found optional query"), r += l() + "OPTIONAL { \n", u++, r += n(t.optional[i]), r += o(t.optional[i]), r += s(t.optional[i]), u--, r += l() + "}\n"; return r }

        function a(t) { var e = l() + "WHERE \n{ \n"; return u++, e += n(t), e += o(t), e += s(t), u--, e += "}" }

        function l() { var t = ""; for (i = 0; i < u; i++) t += "    "; return t }

        function h(t) { return r(t) + a(t.pat) }
        var u = 0;
        return h(t)
    }, e.SPARQLToQuery = function(t, r, n) {
        function o(t) { if (q[t]) return q[t]; var e = n.variable(t); return q[t] = e, e }

        function s(t) { return "string" == typeof t && t.match(/[^ \n\t]/) }

        function a(t) { return "string" == typeof t && t.match(/^[\?\$]/) }

        function l(t) { return "string" == typeof t ? t.replace(/^&lt;/, "<").replace(/&gt;$/, ">") : t }

        function h(t) { return "string" == typeof t && t.match(/^<[^>]*>$/) }

        function u(t) { return "string" == typeof t && (t.match(/^_:/) || t.match(/^$/)) }

        function c(t) { return "string" == typeof t && t.match(/:$/) }

        function d(t) { return "string" == typeof t && t.match(/^:|^[^_][^:]*:/) }

        function f(t) { var e = t.split(":"); return e[0] }

        function p(t) { var e = t.split(":"); return e[1] }

        function m(t) { return h(t) ? t.slice(1, t.length - 1) : t }

        function v(t) {
            var r = -1 == t.indexOf("'") ? null : t.indexOf("'"),
                i = -1 == t.indexOf('"') ? null : t.indexOf('"');
            if (!r && !i) { var o = new Array(1); return o[0] = t, o }
            var s, a, l = new Array(2);
            if (!r || i && r > i) s = '"', a = i;
            else {
                if (i && !(r && i > r)) return e.log.error("SQARQL QUERY OOPS!"), l;
                s = "'", a = r
            }
            l[0] = t.slice(0, a);
            var h = t.slice(a + 1).indexOf(s);
            if (-1 === h) return e.log.error("SPARQL parsing error: no matching parentheses in literal " + t), t;
            var u;
            return t.slice(h + a + 2).match(/^\^\^/) ? (u = t.slice(h + a + 2).indexOf(" "), l[1] = n.literal(t.slice(a + 1, a + 1 + h), "", n.sym(m(t.slice(a + 4 + h, a + 2 + h + u)))), l = l.concat(v(t.slice(h + a + 3 + u)))) : t.slice(h + a + 2).match(/^@/) ? (u = t.slice(h + a + 2).indexOf(" "), l[1] = n.literal(t.slice(a + 1, a + 1 + h), t.slice(a + 3 + h, a + 2 + h + u), null), l = l.concat(v(t.slice(h + a + 2 + u)))) : (l[1] = n.literal(t.slice(a + 1, a + 1 + h), "", null), e.log.info("Literal found: " + l[1]), l = l.concat(v(t.slice(h + a + 2)))), l
        }

        function g(t) {
            t = t.replace(/\(/g, " ( ").replace(/\)/g, " ) ").replace(/</g, " <").replace(/>/g, "> ").replace(/{/g, " { ").replace(/}/g, " } ").replace(/[\t\n\r]/g, " ").replace(/; /g, " ; ").replace(/\. /g, " . ").replace(/, /g, " , "), e.log.info("New str into spaceDelimit: \n" + t);
            var r = [],
                n = t.split(" ");
            for (var i in n) s(n[i]) && (r = r.concat(n[i]));
            return r
        }

        function w(t) {
            for (var e = t, r = 0; r < e.length; r++)
                if ("a" == e[r] && (e[r] = "<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>"), "is" == e[r] && "of" == e[r + 2]) {
                    e.splice(r, 1), e.splice(r + 1, 1);
                    var n = e[r - 1];
                    e[r - 1] = e[r + 1], e[r + 1] = n
                }
            return e
        }

        function b(t) { for (var r = [], i = 0; i < t.length; i++) "string" == typeof t[i] ? (t[i] = l(t[i]), a(t[i]) ? r[i] = o(t[i].slice(1)) : u(t[i]) ? (e.log.info(t[i] + " was identified as a bnode."), r[i] = n.bnode()) : h(t[i]) ? (e.log.info(t[i] + " was identified as a symbol."), r[i] = n.sym(m(t[i]))) : d(t[i]) ? (e.log.info(t[i] + " was identified as a prefixed symbol"), M[f(t[i])] ? r[i] = n.sym(t[i] = M[f(t[i])] + p(t[i])) : (e.log.error("SPARQL error: " + t[i] + " with prefix " + f(t[i]) + " does not have a correct prefix entry."), r[i] = t[i])) : r[i] = t[i]) : r[i] = t[i]; return r }

        function x(t) {
            var r = v(t),
                n = [];
            for (var i in r) n = n.concat("string" == typeof r[i] ? g(r[i]) : r[i]);
            return n = w(n), e.log.info("SPARQL Tokens: " + n), n
        }

        function T(t, e) {
            for (i = 0; i < e.length; i++)
                if ("string" == typeof e[i] && e[i].toLowerCase() == t.toLowerCase()) return i;
            return null
        }

        function N(t, e) { var r = []; for (i = 0; i < e.length; i++) "string" == typeof e[i] && e[i].toLowerCase() == t.toLowerCase() && r.push(i); return r }

        function S(t, r) {
            e.log.info("SPARQL vars: " + t);
            for (var n in t)
                if (a(t[n])) {
                    e.log.info("Added " + t[n] + " to query variables from SPARQL");
                    var i = o(t[n].slice(1));
                    r.vars.push(i), i.label = t[n].slice(1)
                } else e.log.warn("Incorrect SPARQL variable in SELECT: " + t[n])
        }

        function _(t) {
            var r = N("PREFIX", t),
                n = [];
            for (var i in r) {
                var o = t[r[i] + 1],
                    s = t[r[i] + 2];
                if (c(o))
                    if (h(s)) {
                        e.log.info("Prefix found: " + o + " -> " + s);
                        var a = f(o),
                            l = m(s);
                        n[a] = l
                    } else e.log.error("Invalid SPARQL symbol: " + s);
                else e.log.error("Invalid SPARQL prefix: " + o)
            }
            return n
        }

        function k(t, r, n) {
            e.log.info("Looking for a close bracket of type " + n + " in " + t);
            var o = 0;
            for (i = 0; i < t.length; i++)
                if (t[i] == r && o++, t[i] == n && o--, 0 > o) return i;
            return e.log.error("Statement had no close parenthesis in SPARQL query"), 0
        }

        function R(t) { return this.describe = function(e) { return e + " > " + t.toNT() }, this.test = function(e) { return e.value.match(/[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?/) ? parseFloat(e.value) > parseFloat(t) : e.toNT() > t.toNT() }, this }

        function F(t) { return this.describe = function(e) { return e + " < " + t.toNT() }, this.test = function(e) { return e.value.match(/[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?/) ? parseFloat(e.value) < parseFloat(t) : e.toNT() < t.toNT() }, this }

        function I(t) { return this.describe = function(e) { return e + " = " + t.toNT() }, this.test = function(e) { return t.sameTerm(e) }, this }

        function O(t) {
            this.describe = function(e) { return "REGEXP( '" + t + "' , " + e + " )" }, this.test = function(e) {
                var r = t,
                    n = new RegExp(r);
                return e.value ? n.test(e.value) : !1
            }
        }

        function D(t, r) { 3 != t.length || "variable" != t[0].termType || "symbol" != t[2].termType && "literal" != t[2].termType ? 6 == t.length && "string" == typeof t[0] && "regexp" == t[0].toLowerCase() && "(" == t[1] && ")" == t[5] && "," == t[3] && "variable" == t[4].termType && "literal" == t[2].termType && (e.log.debug("Constraint added: " + t), r.constraints[t[4]] = new O(t[2].value)) : "=" == t[1] ? (e.log.debug("Constraint added: " + t), r.constraints[t[0]] = new I(t[2])) : ">" == t[1] ? (e.log.debug("Constraint added: " + t), r.constraints[t[0]] = new R(t[2])) : "<" == t[1] ? (e.log.debug("Constraint added: " + t), r.constraints[t[0]] = new F(t[2])) : e.log.warn("I don't know how to handle the constraint: " + t) }

        function C(t, r) {
            e.log.debug("Optional query: " + t + " not yet implemented.");
            var i = n.formula();
            L(t, i), r.optional.push(i)
        }

        function L(t, r) {
            var n, i = b(t);
            for (e.log.debug("WHERE: " + i); T("OPTIONAL", i);) opt = T("OPTIONAL", i), e.log.debug("OPT: " + opt + " " + i[opt] + " in " + i), "{" != i[opt + 1] && e.log.warn("Bad optional opening bracket in word " + opt), n = k(i.slice(opt + 2), "{", "}"), -1 == n ? e.log.error("No matching bracket in word " + opt) : (C(i.slice(opt + 2, opt + 2 + n), r), opt = T("OPTIONAL", i), n = k(i.slice(opt + 2), "{", "}"), i.splice(opt, n + 3));
            for (e.log.debug("WHERE after optionals: " + i); T("FILTER", i);) { var o = T("FILTER", i); "(" != i[o + 1] && e.log.warn("Bad filter opening bracket in word " + o), n = k(i.slice(o + 2), "(", ")"), -1 == n ? e.log.error("No matching bracket in word " + o) : (D(i.slice(o + 2, o + 2 + n), r), o = T("FILTER", i), n = k(i.slice(o + 2), "(", ")"), i.splice(o, n + 3)) }
            e.log.debug("WHERE after filters and optionals: " + i), A(i, r)
        }

        function A(t, r) {
            var n = new Array(1);
            n[0] = -1;
            for (var i = n.concat(N(".", t)), o = [], s = 0; s < i.length - 1; s++) o[s] = t.slice(i[s] + 1, i[s + 1]);
            for (s in o) {
                e.log.info("s+p+o " + s + " = " + o[s]);
                var a = o[s][0];
                o[s].splice(0, 1);
                var l = n.concat(N(";", o[s]));
                l.push(o[s].length);
                var h = [];
                for (y = 0; y < l.length - 1; y++) h[y] = o[s].slice(l[y] + 1, l[y + 1]);
                for (s in h) {
                    e.log.info("p+o " + s + " = " + o[s]);
                    var u = h[s][0];
                    h[s].splice(0, 1);
                    var c = n.concat(N(",", h[s]));
                    c.push(h[s].length);
                    var d = [];
                    for (y = 0; y < c.length - 1; y++) d[y] = h[s].slice(c[y] + 1, c[y + 1]);
                    for (s in d) {
                        var f = d[s][0];
                        e.log.info("Subj=" + a + " Pred=" + u + " Obj=" + f), r.add(a, u, f)
                    }
                }
            }
        }
        var q = [];
        e.log.info("SPARQL input: \n" + t);
        var j = new e.Query,
            U = x(t),
            M = _(U);
        M.rdf || (M.rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"), M.rdfs || (M.rdfs = "http://www.w3.org/2000/01/rdf-schema#");
        var E = T("SELECT", U),
            H = T("WHERE", U);
        if (0 > E || 0 > H || E > H) return e.log.error("Invalid or nonexistent SELECT and WHERE tags in SPARQL query"), !1;
        if (S(U.slice(E + 1, H), j), L(U.slice(H + 2, U.length - 1), j.pat), r) return j;
        for (var P in j.pat.statements) { var X = j.pat.statements[P]; "symbol" == X.subject.termType && e.fetcher && e.fetcher.lookUpThing(X.subject, "sparql:" + X.subject), "symbol" == X.object.termType && e.fetcher && e.fetcher.lookUpThing(X.object, "sparql:" + X.object) }
        return j
    }, e.SPARQLResultsInterpreter = function(t, r, n) {
        function i(t) { return "string" == typeof t && t.match(/^:|^[^_][^:]*:/) }

        function o(t) { var e = t.split(":"); return e[0] }

        function s(t) { var e = t.split(":"); return e[1] }

        function a(t) {
            if (!t.name.match(/^xmlns/)) return !1;
            var r = t.name.replace(/^xmlns/, "").replace(/^:/, "").replace(/ /g, "");
            f[r] = t.value, e.log.info("Prefix: " + r + "\nValue: " + t.value)
        }

        function l(t) { var r, n; return i(t) ? (r = o(t), n = s(t)) : (r = "", n = t), f[r] ? f[r] + n : void e.log.error("Incorrect SPARQL results - bad prefix") }

        function h(t) {
            for (var r = t.childNodes[0], n = 0; n < t.childNodes.length; n++)
                if (3 == t.childNodes[n].nodeType) { r = t.childNodes[n]; break }
            return l(t.nodeName) == y + "uri" ? kb.sym(r.nodeValue) : l(t.nodeName) == y + "literal" ? kb.literal(r.nodeValue) : l(t.nodeName) == y + "unbound" ? "unbound" : (e.log.warn("Don't know how to handle xml binding term " + t), !1)
        }

        function u(t) {
            for (var n = [], i = !1, o = 0; o < t.childNodes.length; o++)
                if (1 == t.childNodes[o].nodeType)
                    if (l(t.childNodes[o].nodeName) == y + "binding") {
                        for (var s = t.childNodes[o], a = makeVar(s.getAttribute("name")), u = null, c = 0; c < s.childNodes.length; c++)
                            if (1 == s.childNodes[c].nodeType) { u = h(s.childNodes[c]); break }
                        if (!u) return e.log.warn("Bad binding"), !1;
                        e.log.info("var: " + a + " binding: " + u), i = !0, "unbound" != u && (n[a] = u)
                    } else e.log.warn("Bad binding node inside result");
            i && r && setTimeout(function() { r(n) }, 0), p.push(n)
        }
        var c, d, f = [],
            p = [],
            m = t.childNodes[0],
            y = "http://www.w3.org/2005/sparql-results#";
        f[""] = "";
        var v;
        if ("sparql" != m.nodeName) return void e.log.error("Bad SPARQL results XML");
        for (v = 0; v < m.attributes.length; v++) a(m.attributes[v]);
        for (v = 0; v < m.childNodes.length; v++) e.log.info("Type: " + m.childNodes[v].nodeType + "\nName: " + m.childNodes[v].nodeName + "\nValue: " + m.childNodes[v].nodeValue), 1 == m.childNodes[v].nodeType && l(m.childNodes[v].nodeName) == y + "head" ? c = m.childNodes[v] : 1 == m.childNodes[v].nodeType && l(m.childNodes[v].nodeName) == y + "results" && (d = m.childNodes[v]);
        if (!d && !c) return void e.log.error("Bad SPARQL results XML");
        for (v = 0; v < c.childNodes.length; v++) 1 == c.childNodes[v].nodeType && l(c.childNodes[v].nodeName) == y + "variable" && e.log.info("Var: " + c.childNodes[v].getAttribute("name"));
        for (v = 0; v < d.childNodes.length; v++) l(d.childNodes[v].nodeName) == y + "result" && (e.log.info("Result # " + v), u(d.childNodes[v]));
        return n && n(), p
    }, e.sparqlUpdate = function() {
        var t = function(t) { this.store = t, this.ifps = {}, this.fps = {}, this.ns = {}, this.ns.link = e.Namespace("http://www.w3.org/2007/ont/link#"), this.ns.http = e.Namespace("http://www.w3.org/2007/ont/http#"), this.ns.httph = e.Namespace("http://www.w3.org/2007/ont/httph#"), this.ns.rdf = e.Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#"), this.ns.rdfs = e.Namespace("http://www.w3.org/2000/01/rdf-schema#"), this.ns.rdf = e.Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#"), this.ns.owl = e.Namespace("http://www.w3.org/2002/07/owl#") };
        return t.prototype.editable = function(t, r) {
            if (!t) return !1;
            if (r || (r = tabulator.kb), "file:///" == t.slice(0, 8)) { if (r.holds(r.sym(t), tabulator.ns.rdf("type"), tabulator.ns.link("MachineEditableDocument"))) return "LOCALFILE"; var n = r.statementsMatching(r.sym(t), void 0, void 0); return tabulator.log.warn("sparql.editable: Not MachineEditableDocument file " + t + "\n"), tabulator.log.warn(n.map(function(t) { return t.toNT() }).join("\n")), !1 }
            for (var i, o = !1, s = r.each(void 0, this.ns.link("requestedURI"), e.uri.docpart(t)), a = 0; a < s.length; a++)
                if (i = s[a], void 0 !== i) {
                    var l = r.any(i, this.ns.link("response"));
                    if (void 0 !== i) {
                        var h = r.each(l, this.ns.httph("ms-author-via"));
                        if (h.length)
                            for (var u = 0; u < h.length; u++) { var c = h[u].value.trim(); if (c.indexOf("SPARQL") >= 0) return "SPARQL"; if (c.indexOf("DAV") >= 0) return "DAV" }
                        var d = r.each(l, this.ns.http("status"));
                        if (d.length)
                            for (var u = 0; u < d.length; u++)(200 == d[u] || 404 == d[u]) && (o = !0)
                    } else tabulator.log.warn("sparql.editable: No response for " + t + "\n")
                }
            if (0 == s.length) tabulator.log.warn("sparql.editable: No request for " + t + "\n");
            else if (o) return !1;
            return void tabulator.log.warn("sparql.editable: inconclusive for " + t + "\n")
        }, t.prototype.anonymize = function(t) { return "_:" == t.toNT().substr(0, 2) && this._mentioned(t) ? "?" + t.toNT().substr(2) : t.toNT() }, t.prototype.anonymizeNT = function(t) { return this.anonymize(t.subject) + " " + this.anonymize(t.predicate) + " " + this.anonymize(t.object) + " ." }, t.prototype._statement_bnodes = function(t) { return [t.subject, t.predicate, t.object].filter(function(t) { return t.isBlank }) }, t.prototype._statement_array_bnodes = function(t) {
            for (var e = [], r = 0; r < t.length; r++) e = e.concat(this._statement_bnodes(t[r]));
            e.sort(), bnodes2 = [];
            for (var n = 0; n < e.length; n++) 0 != n && e[n].sameTerm(e[n - 1]) || bnodes2.push(e[n]);
            return bnodes2
        }, t.prototype._cache_ifps = function() {
            this.ifps = {};
            for (var t = this.store.each(void 0, this.ns.rdf("type"), this.ns.owl("InverseFunctionalProperty")), e = 0; e < t.length; e++) this.ifps[t[e].uri] = !0;
            this.fps = {};
            for (var t = this.store.each(void 0, this.ns.rdf("type"), this.ns.owl("FunctionalProperty")), e = 0; e < t.length; e++) this.fps[t[e].uri] = !0
        }, t.prototype._bnode_context2 = function(t, e, r) {
            for (var n = this.store.statementsMatching(void 0, void 0, t, e), i = 0; i < n.length; i++)
                if (this.fps[n[i].predicate.uri]) { var o = n[i].subject; if (!o.isBlank) return [n[i]]; if (r) { var s = this._bnode_context2(o, e, r - 1); if (null != s) return s.concat([n[i]]) } }
            for (var n = this.store.statementsMatching(t, void 0, void 0, e), i = 0; i < n.length; i++)
                if (this.ifps[n[i].predicate.uri]) { var o = n[i].object; if (!o.isBlank) return [n[i]]; if (r) { var s = this._bnode_context2(o, e, r - 1); if (void 0 != s) return s.concat([n[i]]) } }
            return null
        }, t.prototype._bnode_context_1 = function(t, e) { for (var r = 0; 3 > r; r++) { var n = this._bnode_context2(t, e, r); if (null !== n) return n } throw "Unable to uniquely identify bnode: " + t.toNT() }, t.prototype._mentioned = function(t) { return 0 !== this.store.statementsMatching(t).length || 0 !== this.store.statementsMatching(void 0, t).length || 0 !== this.store.statementsMatching(void 0, void 0, t).length }, t.prototype._bnode_context = function(t, e) {
            var r = [];
            if (t.length) {
                this._cache_ifps();
                for (var n = 0; n < t.length; n++) {
                    var i = t[n];
                    this._mentioned(i) && (r = r.concat(this._bnode_context_1(i, e)))
                }
            }
            return r
        }, t.prototype._statement_context = function(t) { var e = this._statement_bnodes(t); return this._bnode_context(e, t.why) }, t.prototype._context_where = function(t) { var e = this; return void 0 == t || 0 == t.length ? "" : "WHERE { " + t.map(function(t) { return e.anonymizeNT(t) }).join("\n") + " }\n" }, t.prototype._fire = function(t, r, n) {
            if (!t) throw "No URI given for remote editing operation: " + r;
            tabulator.log.info("sparql: sending update to <" + t + ">\n   query=" + r + "\n");
            var i = e.Util.XMLHTTPFactory();
            if (i.onreadystatechange = function() {
                    if (4 == i.readyState) {
                        var e = !i.status || i.status >= 200 && i.status < 300;
                        e ? tabulator.log.debug("sparql: update Ok for <" + t + ">") : tabulator.log.error("sparql: update failed for <" + t + "> status=" + i.status + ", " + i.statusText + ", body length=" + i.responseText.length + "\n   for query: " + r), n(t, e, i.responseText, i)
                    }
                }, !tabulator.isExtension) try { e.Util.enablePrivilege("UniversalBrowserRead") } catch (o) { alert("Failed to get privileges: " + o) }
            i.open("PATCH", t, !0), i.setRequestHeader("Content-type", "application/sparql-update"), i.send(r)
        }, t.prototype.update_statement = function(t) {
            if (!t || void 0 != t.why) {
                var e = this,
                    r = this._statement_context(t);
                return { statement: t ? [t.subject, t.predicate, t.object, t.why] : void 0, statementNT: t ? this.anonymizeNT(t) : void 0, where: e._context_where(r), set_object: function(t, r) { query = this.where, query += "DELETE DATA { " + this.statementNT + " } ;\n", query += "INSERT DATA { " + this.anonymize(this.statement[0]) + " " + this.anonymize(this.statement[1]) + " " + this.anonymize(t) + "  . }\n", e._fire(this.statement[3].uri, query, r) } }
            }
        }, t.prototype.insert_statement = function(t, e) {
            var r = t instanceof Array ? t[0] : t,
                n = this._context_where(this._statement_context(r));
            if (t instanceof Array) {
                for (var i = "", o = 0; o < t.length; o++) i += t[o] + "\n";
                n += "INSERT DATA { " + i + " }\n"
            } else n += "INSERT DATA { " + this.anonymize(t.subject) + " " + this.anonymize(t.predicate) + " " + this.anonymize(t.object) + "  . }\n";
            this._fire(r.why.uri, n, e)
        }, t.prototype.delete_statement = function(t, e) {
            var r = t instanceof Array ? t[0] : t,
                n = this._context_where(this._statement_context(r));
            if (t instanceof Array) {
                for (var i = "", o = 0; o < t.length; o++) i += t[o] + "\n";
                n += "DELETE DATA { " + i + " }\n"
            } else n += "DELETE DATA { " + this.anonymize(t.subject) + " " + this.anonymize(t.predicate) + " " + this.anonymize(t.object) + "  . }\n";
            this._fire(r.why.uri, n, e)
        }, t.prototype.update = function(t, r, n) {
            var i = this.store;
            tabulator.log.info("update called");
            var o = void 0 == t ? [] : t instanceof e.IndexedFormula ? t.statements : t instanceof Array ? t : [t],
                s = void 0 == r ? [] : r instanceof e.IndexedFormula ? r.statements : r instanceof Array ? r : [r];
            if (!(o instanceof Array)) throw "Type Error " + typeof o + ": " + o;
            if (!(s instanceof Array)) throw "Type Error " + typeof s + ": " + s;
            if (0 === o.length && 0 === s.length) return n(null, !0);
            var a = o.length ? o[0].why : s[0].why;
            o.map(function(t) { if (!a.sameTerm(t.why)) throw "sparql update: destination " + a + " inconsistent with ds " + t.why }), s.map(function(t) { if (!a.sameTerm(t.why)) throw "sparql update: destination = " + a + " inconsistent with st.why =" + t.why });
            var l = this.editable(a.uri, i);
            if (!l) throw "Can't make changes in uneditable " + a;
            if (l.indexOf("SPARQL") >= 0) {
                var h = [];
                o.length && (h = this._statement_array_bnodes(o)), s.length && (h = h.concat(this._statement_array_bnodes(s)));
                var u = this._bnode_context(h, a),
                    c = this._context_where(u),
                    d = "";
                if (c.length) {
                    if (o.length) {
                        d += "DELETE { ";
                        for (var f = 0; f < o.length; f++) d += this.anonymizeNT(o[f]) + "\n";
                        d += " }\n"
                    }
                    if (s.length) {
                        d += "INSERT { ";
                        for (var f = 0; f < s.length; f++) d += this.anonymizeNT(s[f]) + "\n";
                        d += " }\n"
                    }
                    d += c
                } else {
                    if (o.length) {
                        d += "DELETE DATA { ";
                        for (var f = 0; f < o.length; f++) d += this.anonymizeNT(o[f]) + "\n";
                        d += " } \n"
                    }
                    if (s.length) {
                        o.length && (d += " ; "), d += "INSERT DATA { ";
                        for (var f = 0; f < s.length; f++) d += this.anonymizeNT(s[f]) + "\n";
                        d += " }\n"
                    }
                }
                this._fire(a.uri, d, function(t, e, r, l) {
                    if (tabulator.log.info("	 sparql: Return success=" + e + " for query " + d + "\n"), e) {
                        for (var h = 0; h < o.length; h++) try { i.remove(o[h]) } catch (u) { n(t, !1, "sparqlUpdate: Remote OK but error deleting statemmnt " + o[h] + " from local store:\n" + u) }
                        for (var h = 0; h < s.length; h++) i.add(s[h].subject, s[h].predicate, s[h].object, a)
                    }
                    n(t, e, r, l)
                })
            } else if (l.indexOf("DAV") >= 0) {
                var p, m = i.any(a, this.ns.link("request"));
                if (!m) throw "No record of our HTTP GET request for document: " + a;
                var y = i.any(m, this.ns.link("response"));
                if (!y) return null;
                for (var v = i.the(y, this.ns.httph("content-type")).value, g = i.statementsMatching(void 0, void 0, void 0, a).slice(), f = 0; f < o.length; f++) e.Util.RDFArrayRemove(g, o[f]);
                for (var f = 0; f < s.length; f++) g.push(s[f]);
                var w = e.Serializer(i);
                switch (w.suggestNamespaces(i.namespaces), w.setBase(a.uri), v) {
                    case "application/rdf+xml":
                        p = w.statementsToXML(g);
                        break;
                    case "text/n3":
                    case "text/turtle":
                    case "application/x-turtle":
                    case "application/n3":
                        p = w.statementsToN3(g);
                        break;
                    default:
                        throw "Content-type " + v + " not supported for data write"
                }
                var b = i.the(y, this.ns.httph("content-location"));
                b && (targetURI = e.uri.join(b.value, targetURI));
                var x = e.Util.XMLHTTPFactory();
                x.onreadystatechange = function() {
                    if (4 == x.readyState) {
                        var t = !x.status || x.status >= 200 && x.status < 300;
                        if (t) { for (var e = 0; e < o.length; e++) i.remove(o[e]); for (var e = 0; e < s.length; e++) i.add(s[e].subject, s[e].predicate, s[e].object, a) }
                        n(a.uri, t, x.responseText)
                    }
                }, x.open("PUT", targetURI, !0), x.setRequestHeader("Content-type", v), x.send(p)
            } else {
                if (!(l.indexOf("LOCALFILE") >= 0)) throw "Unhandled edit method: '" + l + "' for " + a;
                try {
                    tabulator.log.info("Writing back to local file\n");
                    for (var g = i.statementsMatching(void 0, void 0, void 0, a).slice(), f = 0; f < o.length; f++) e.Util.RDFArrayRemove(g, o[f]);
                    for (var f = 0; f < s.length; f++) g.push(s[f]);
                    var p, w = e.Serializer(i);
                    w.suggestNamespaces(i.namespaces), w.setBase(a.uri);
                    var T = a.uri.lastIndexOf(".");
                    if (1 > T) throw "Rewriting file: No filename extension: " + a.uri;
                    var N = a.uri.slice(T + 1);
                    switch (N) {
                        case "rdf":
                        case "owl":
                        case "xml":
                            p = w.statementsToXML(g);
                            break;
                        case "n3":
                        case "nt":
                        case "ttl":
                            p = w.statementsToN3(g);
                            break;
                        default:
                            throw "File extension ." + N + " not supported for data write"
                    }
                    dump("Writing back: <<<" + p + ">>>\n");
                    var S = a.uri.slice(7),
                        _ = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
                    if (_.initWithPath(S), !_.exists()) throw "Rewriting file <" + a.uri + "> but it does not exist!";
                    var k = Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);
                    k.init(_, 42, 438, 0), k.write(p, p.length), k.close();
                    for (var f = 0; f < o.length; f++) i.remove(o[f]);
                    for (var f = 0; f < s.length; f++) i.add(s[f].subject, s[f].predicate, s[f].object, a);
                    n(a.uri, !0, "")
                } catch (R) { n(a.uri, !1, "Exception trying to write back file <" + a.uri + ">\n" + tabulator.Util.stackString(R)) }
            }
        }, t.prototype.put = function(t, r, n, i) {
            var o, s = this.store;
            if ("string" == typeof r) o = r;
            else {
                var a = e.Serializer(s);
                switch (a.suggestNamespaces(s.namespaces), a.setBase(t.uri), n) {
                    case "application/rdf+xml":
                        o = a.statementsToXML(r);
                        break;
                    case "text/n3":
                    case "text/turtle":
                    case "application/x-turtle":
                    case "application/n3":
                        o = a.statementsToN3(r);
                        break;
                    default:
                        throw "Content-type " + n + " not supported for data PUT"
                }
            }
            var l = e.Util.XMLHTTPFactory();
            l.onreadystatechange = function() {
                if (4 == l.readyState) {
                    var e = !l.status || l.status >= 200 && l.status < 300;
                    i(t.uri, e, l.responseText, l)
                }
            }, l.open("PUT", t.uri, !0), l.setRequestHeader("Content-type", n), l.send(o)
        }, t
    }(), e.jsonParser = function() {
        return {
            parseJSON: function(t, e, r) {
                var n, i, o, s = {},
                    a = r.sym(e);
                for (x in t) {
                    0 === x.indexOf("_:") ? s[x] ? n = s[x] : (n = r.bnode(x), s[x] = n) : n = r.sym(x);
                    var l = t[x];
                    for (y in l) {
                        var h = l[y];
                        i = r.sym(y);
                        for (z in h) {
                            var u = h[z];
                            if ("uri" === u.type) o = r.sym(u.value), r.add(n, i, o, a);
                            else if ("bnode" === u.type) s[u.value] ? o = s[u.value] : (o = r.bnode(u.value), s[u.value] = o), r.add(n, i, o, a);
                            else {
                                if ("literal" !== u.type) throw "error: unexpected termtype: " + z.type;
                                o = u.datatype ? r.literal(u.value, void 0, r.sym(u.datatype)) : u.lang ? r.literal(u.value, u.lang) : r.literal(u.value), r.add(n, i, o, a)
                            }
                        }
                    }
                }
            }
        }
    }(), e.Serializer = function() {
        function r(t) { return encodeURI(t) }

        function n(t) { for (var e, r = "", n = 0; n < t.length; n++) e = t.charCodeAt(n), r += e > 65535 ? "\\U" + ("00000000" + e.toString(16)).slice(-8) : e > 126 ? "\\u" + ("0000" + e.toString(16)).slice(-4) : t[n]; return r }
        var o = function(t) { this.flags = "", this.base = null, this.prefixes = [], this.namespacesUsed = [], this.keywords = ["a"], this.prefixchars = "abcdefghijklmnopqustuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", this.incoming = null, this.formulas = [], this.store = t };
        o.prototype.setBase = function(t) { this.base = t }, o.prototype.setFlags = function(t) { this.flags = t ? t : "" }, o.prototype.toStr = function(t) { var e = t.toNT(); return "formula" == t.termType && (this.formulas[e] = t), e }, o.prototype.fromStr = function(t) { if ("{" == t[0]) { var e = this.formulas[t]; return e || alert("No formula object for " + t), e } return this.store.fromNT(t) }, o.prototype.suggestPrefix = function(t, e) { "default" !== t.slice(0, 7) && "ns" !== t.slice(0, 2) && (this.prefixes[e] = t) }, o.prototype.suggestNamespaces = function(t) { for (var e in t) this.prefixes[t[e]] = e }, o.prototype.makeUpPrefix = function(t) {
            function e(e) { return i[e] ? !1 : o.prototype.validPrefix.test(e) ? "ns" === e ? !1 : (this.prefixes[t] = e, r = e, !0) : !1 }
            var r, n = t,
                i = [];
            e = e.bind(this);
            for (var s in this.prefixes) i[this.prefixes[s]] = s;
            "#/".indexOf(n[n.length - 1]) >= 0 && (n = n.slice(0, -1));
            var a = n.lastIndexOf("/");
            a >= 0 && (n = n.slice(a + 1));
            for (var l = 0; l < n.length && this.prefixchars.indexOf(n[l]);) l++;
            if (n = n.slice(0, l), n.length < 6 && e(n)) return r;
            if (e(n.slice(0, 3))) return r;
            if (e(n.slice(0, 2))) return r;
            if (e(n.slice(0, 4))) return r;
            if (e(n.slice(0, 1))) return r;
            if (e(n.slice(0, 5))) return r;
            o.prototype.validPrefix.test(n) || (n = "n");
            for (var l = 0;; l++)
                if (e(n.slice(0, 3) + l)) return r
        }, o.prototype.rootSubjects = function(t) {
            for (var e = {}, r = {}, n = {}, i = 0; i < t.length; i++) {
                var o = t[i];
                [o.subject, o.predicate, o.object].map(function(t) { "bnode" == t.termType && (n[t.toNT()] = !0) });
                var s = t[i].object;
                e.hasOwnProperty(s) || (e[s] = []), e[s].push(o.subject);
                var a = r[this.toStr(o.subject)];
                a || (a = []), a.push(o), r[this.toStr(o.subject)] = a
            }
            var l = [];
            for (var h in r)
                if (r.hasOwnProperty(h)) { var s = this.fromStr(h); "bnode" == s.termType && e[s] && 1 == e[s].length || l.push(s) }
            this.incoming = e;
            for (var u = {}, i = 0; i < l.length; i++) u[l[i].toNT()] = !0;
            return { roots: l, subjects: r, rootsHash: u, incoming: e }
        }, o.prototype.toN3 = function(t) { return this.statementsToN3(t.statements) }, o.prototype._notQNameChars = "	\r\n !\"#$%&'()*.,+/;<=>?@[\\]^`{|}~", o.prototype._notNameChars = o.prototype._notQNameChars + ":", o.prototype.statementsToN3 = function(t) {
            function r(t) {
                for (var e = this.rootSubjects(t), r = e.roots, i = [], o = 0; o < r.length; o++) {
                    var s = r[o];
                    i.push(n(s, e))
                }
                return i
            }

            function n(t, e) { return "bnode" != t.termType || e.incoming[t] ? [l(t, e)].concat([s(t, e)]).concat(["."]) : a(t, e, !0).concat(["."]) }

            function s(t, e) {
                var r = [],
                    n = null,
                    i = e.subjects[this.toStr(t)];
                if ("undefined" == typeof i) throw "Cant find statements for " + t;
                i.sort();
                for (var o = [], s = 0; s < i.length; s++) {
                    var h = i[s];
                    h.predicate.uri == n ? o.push(",") : (n && (r = r.concat([o]).concat([";"]), o = []), r.push(d[h.predicate.uri] ? d[h.predicate.uri] : l(h.predicate, e))), n = h.predicate.uri, o.push(a(h.object, e))
                }
                return r = r.concat([o])
            }

            function a(t, e, r) { return "bnode" == t.termType && e.subjects[this.toStr(t)] && (r || void 0 == e.rootsHash[t.toNT()]) ? ["["].concat(s(t, e)).concat(["]"]) : l(t, e) }

            function l(t, e) {
                switch (t.termType) {
                    case "formula":
                        var n = ["{"];
                        return n = n.concat(r(t.statements)), n.concat(["}"]);
                    case "collection":
                        var n = ["("];
                        for (i = 0; i < t.elements.length; i++) n.push([a(t.elements[i], e)]);
                        return n.push(")"), n;
                    default:
                        return this.atomicTermToN3(t)
                }
            }

            function h() {
                var t = "";
                this.defaultNamespace && (t += "@prefix : <" + this.defaultNamespace + ">.\n");
                for (var r in this.prefixes) this.prefixes.hasOwnProperty(r) && this.namespacesUsed[r] && (t += "@prefix " + this.prefixes[r] + ": <" + e.uri.refTo(this.base, r) + ">.\n");
                return t + "\n"
            }
            var u = 4,
                c = 80,
                d = { "http://www.w3.org/2002/07/owl#sameAs": "=", "http://www.w3.org/2000/10/swap/log#implies": "=>", "http://www.w3.org/1999/02/22-rdf-syntax-ns#type": "a" },
                f = function(t) { for (var e = "", r = 0; t > r; r++) e += " "; return e },
                p = function(t) {
                    for (var e = "", r = 0; r < t.length; r++) {
                        var n = t[r],
                            i = "string" == typeof n ? n : p(n);
                        0 != r && "," != i && ";" != i && (e += " "), e += i
                    }
                    return e
                },
                m = function(t, e) {
                    var r = "",
                        n = 1e5;
                    e || (e = 0);
                    for (var i = 0; i < t.length; i++) {
                        var o = t[i];
                        if ("string" != typeof o) {
                            var s = m(o, e + 1);
                            if (s.length < 10 * (c - u * e) && s.indexOf('"""') < 0) {
                                var a = p(o);
                                a.length < c - u * e && (o = "   " + a, s = "")
                            }
                            s && (n = 1e4), r += s
                        }
                        if ("string" == typeof o) {
                            if ("1" == o.length && "\n" == r.slice(-1)) { if (",.;".indexOf(o) >= 0) { r = r.slice(0, -1) + o + "\n", n += 1; continue } if ("])}".indexOf(o) >= 0) { r = r.slice(0, -1) + " " + o + "\n", n += 2; continue } }
                            if (u * e + 4 > n) r = r.slice(0, -1) + " " + o + "\n", n += o.length + 1;
                            else {
                                var a = f(u * e) + o;
                                r += a + "\n", n = a.length
                            }
                        }
                    }
                    return r
                };
            r = r.bind(this), s = s.bind(this), a = a.bind(this), o.prototype.termToN3 = l, l = l.bind(this), h = h.bind(this);
            var y = r(t);
            return h() + m(y, -1)
        }, o.prototype.atomicTermToN3 = function(t, e) {
            switch (t.termType) {
                case "bnode":
                case "variable":
                    return t.toNT();
                case "literal":
                    if (t.datatype) switch (t.datatype.uri) {
                        case "http://www.w3.org/2001/XMLSchema#integer":
                            return t.value.toString();
                        case "http://www.w3.org/2001/XMLSchema#boolean":
                            return t.value ? "true" : "false"
                    }
                    var r = this.stringToN3(t.value);
                    return t.lang && (r += "@" + t.lang), t.datatype && (r += "^^" + this.termToN3(t.datatype, e)), r;
                case "symbol":
                    return this.symbolToN3(t);
                default:
                    throw "Internal: atomicTermToN3 cannot handle " + t + " of termType+" + t.termType
            }
        }, o.prototype.validPrefix = new RegExp(/^[a-zA-Z][a-zA-Z0-9]*$/), o.prototype.forbidden1 = new RegExp(/[\\"\b\f\r\v\t\n\u0080-\uffff]/gm), o.prototype.forbidden3 = new RegExp(/[\\"\b\f\r\v\u0080-\uffff]/gm), o.prototype.stringToN3 = function(t, e) {
            e || (e = "e");
            var r, n, i = "",
                s = 0,
                a = 0;
            for (t.length > 20 && '"' != t.slice(-1) && e.indexOf("n") < 0 && (t.indexOf("\n") > 0 || t.indexOf('"') > 0) ? (r = '"""', n = o.prototype.forbidden3) : (r = '"', n = o.prototype.forbidden1), s = 0; s < t.length;) {
                n.lastIndex = 0;
                var l = n.exec(t.slice(s));
                if (null == l) break;
                a = s + n.lastIndex - 1, i += t.slice(s, a);
                var h = t[a];
                if ('"' == h && '"""' == r && '"""' != t.slice(a, a + 3)) i += h;
                else {
                    var u = '\b\f\r	\n\\"'.indexOf(h);
                    i += u >= 0 ? "\\" + 'bfrtvn\\"' [u] : e.indexOf("e") >= 0 ? "\\u" + ("000" + h.charCodeAt(0).toString(16).toLowerCase()).slice(-4) : h
                }
                s = a + 1
            }
            return r + i + t.slice(s) + r
        }, o.prototype.symbolToN3 = function(t) {
            var i = t.uri,
                s = i.indexOf("#");
            if (0 > s && this.flags.indexOf("/") < 0 && (s = i.lastIndexOf("/")), s >= 0 && this.flags.indexOf("p") < 0) {
                for (var a = !0, l = s + 1; l < i.length; l++)
                    if (o.prototype._notNameChars.indexOf(i[l]) >= 0) { a = !1; break }
                if (i.slice(0, s) == this.base) return "<#" + i.slice(s + 1) + ">";
                if (a) {
                    var h = i.slice(s + 1),
                        u = i.slice(0, s + 1);
                    if (this.defaultNamespace && this.defaultNamespace == u && this.flags.indexOf("d") < 0) return this.flags.indexOf("k") >= 0 && this.keyords.indexOf(h) < 0 ? h : ":" + h;
                    var c = this.prefixes[u];
                    if (c || (c = this.makeUpPrefix(u)), c) return this.namespacesUsed[u] = !0, c + ":" + h
                }
            }
            return i = this.flags.indexOf("r") < 0 && this.base ? e.uri.refTo(this.base, i) : this.flags.indexOf("u") >= 0 ? n(i) : r(i), "<" + i + ">"
        }, o.prototype.writeStore = function(t) {
            var e = this.store,
                r = e.fetcher,
                n = r && r.appNode,
                i = e.statementsMatching(void 0, e.sym("http://www.w3.org/2007/ont/link#requestedURI")).map(function(t) { return t.subject });
            n && i.push(n);
            var o = [];
            i.map(function(t) { o = o.concat(e.statementsMatching(void 0, void 0, void 0, t)) }), t(this.statementsToN3(o));
            var a = this.store.index[3];
            for (s in a) {
                var l = e.fromNT(s);
                n && l.sameTerm(n) || t("\n" + this.atomicTermToN3(l) + " " + this.atomicTermToN3(e.sym("http://www.w3.org/2000/10/swap/log#")) + " { " + this.statementsToN3(e.statementsMatching(void 0, void 0, void 0, l)) + " }.\n")
            }
        }, o.prototype.statementsToXML = function(r) {
            function n(e) { this.suggestPrefix("rdf", "http://www.w3.org/1999/02/22-rdf-syntax-ns#"); for (var r = this.rootSubjects(e), n = r.roots, i = [], o = 0; o < n.length; o++) t = n[o], i.push(a(t, r)); return i }

            function i(t) {
                return "undefined" == typeof t ? "@@@undefined@@@@" : t.replace(/[&<"]/g, function(t) {
                    switch (t[0]) {
                        case "&":
                            return "&";
                        case "<":
                            return "&lt;";
                        case '"':
                            return "&quot;"
                    }
                })
            }

            function s(t) { return i(this.base ? e.Util.uri.refTo(this.base, t.uri) : t.uri) }

            function a(t, r) {
                var n, o, h, c, d = [],
                    f = r.subjects[this.toStr(t)];
                if ("undefined" == typeof f) throw "Serializing XML - Cant find statements for " + t;
                f.sort(function(t, e) {
                    var r = t.predicate.uri,
                        n = e.predicate.uri;
                    if (r.substring(0, p.length) == p || n.substring(0, p.length) == p) return r.localeCompare(n);
                    var i = r.substring(p.length),
                        o = n.substring(p.length),
                        s = parseInt(i),
                        a = parseInt(o);
                    return isNaN(s) || isNaN(a) || s != i || a != o ? r.localeCompare(n) : s - a
                });
                for (var m = 0; m < f.length; m++)
                    if (h = f[m], "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" != h.predicate.uri || n || "symbol" != h.object.termType) {
                        if (c = h.predicate, c.uri.substr(0, p.length) == p) {
                            var y = c.uri.substr(p.length),
                                v = parseInt(y);
                            y == v.toString() && (c = new e.Symbol("http://www.w3.org/1999/02/22-rdf-syntax-ns#li"))
                        }
                        switch (o = u(c), h.object.termType) {
                            case "bnode":
                                d = d.concat(1 == r.incoming[h.object].length ? ["<" + o + ">", a(h.object, r), "</" + o + ">"] : ["<" + o + ' rdf:nodeID="' + h.object.toNT().slice(2) + '"/>']);
                                break;
                            case "symbol":
                                d = d.concat(["<" + o + ' rdf:resource="' + s(h.object) + '"/>']);
                                break;
                            case "literal":
                                d = d.concat(["<" + o + (h.object.dt ? ' rdf:datatype="' + i(h.object.dt.uri) + '"' : "") + (h.object.lang ? ' xml:lang="' + h.object.lang + '"' : "") + ">" + i(h.object.value) + "</" + o + ">"]);
                                break;
                            case "collection":
                                d = d.concat(["<" + o + ' rdf:parseType="Collection">', l(h.object, r), "</" + o + ">"]);
                                break;
                            default:
                                throw "Can't serialize object of type " + h.object.termType + " into XML"
                        }
                    } else n = h.object;
                var g = n ? u(n) : "rdf:Description",
                    w = "";
                return "bnode" == t.termType ? r.incoming[t] && 1 == r.incoming[t].length || (w = ' rdf:nodeID="' + t.toNT().slice(2) + '"') : w = ' rdf:about="' + s(t) + '"', ["<" + g + w + ">"].concat([d]).concat(["</" + g + ">"])
            }

            function l(t, e) { for (var r = [], n = 0; n < t.elements.length; n++) r.push(a(t.elements[n], e)); return r }

            function h(t, e) {
                var r = [],
                    n = e.subjects[this.toStr(t)];
                if (void 0 == n) return r;
                n.sort();
                for (var o = 0; o < n.length; o++) {
                    var a = n[o];
                    switch (a.object.termType) {
                        case "bnode":
                            r = r.concat(e.rootsHash[a.object.toNT()] ? ["<" + u(a.predicate) + ' rdf:nodeID="' + a.object.toNT().slice(2) + '">', "</" + u(a.predicate) + ">"] : ["<" + u(a.predicate) + ' rdf:parseType="Resource">', h(a.object, e), "</" + u(a.predicate) + ">"]);
                            break;
                        case "symbol":
                            r = r.concat(["<" + u(a.predicate) + ' rdf:resource="' + s(a.object) + '"/>']);
                            break;
                        case "literal":
                            r = r.concat(["<" + u(a.predicate) + (a.object.datatype ? ' rdf:datatype="' + i(a.object.datatype.uri) + '"' : "") + (a.object.lang ? ' xml:lang="' + a.object.lang + '"' : "") + ">" + i(a.object.value) + "</" + u(a.predicate) + ">"]);
                            break;
                        case "collection":
                            r = r.concat(["<" + u(a.predicate) + ' rdf:parseType="Collection">', l(a.object, e), "</" + u(a.predicate) + ">"]);
                            break;
                        default:
                            throw "Can't serialize object of type " + a.object.termType + " into XML"
                    }
                }
                return r
            }

            function u(t) {
                var e = t.uri,
                    r = e.indexOf("#");
                if (0 > r && this.flags.indexOf("/") < 0 && (r = e.lastIndexOf("/")), 0 > r) throw "Cannot make qname out of <" + e + ">";
                for (var n = r + 1; n < e.length; n++)
                    if (o.prototype._notNameChars.indexOf(e[n]) >= 0) throw 'Invalid character "' + e[n] + '" cannot be in XML qname for URI: ' + e;
                var i = e.slice(r + 1),
                    s = e.slice(0, r + 1);
                if (this.defaultNamespace && this.defaultNamespace == s && this.flags.indexOf("d") < 0) return i;
                var a = this.prefixes[s];
                return a || (a = this.makeUpPrefix(s)), f[s] = !0, a + ":" + i
            }
            var c = 4,
                d = 80,
                f = [];
            f["http://www.w3.org/1999/02/22-rdf-syntax-ns#"] = !0;
            var p = "http://www.w3.org/1999/02/22-rdf-syntax-ns#_",
                m = function(t) { for (var e = "", r = 0; t > r; r++) e += " "; return e },
                y = function(t) {
                    for (var e = "", r = 0; r < t.length; r++) {
                        var n = t[r],
                            i = "string" == typeof n ? n : y(n);
                        e += i
                    }
                    return e
                },
                v = function(t, e) {
                    var r = "",
                        n = 1e5;
                    e || (e = 0);
                    for (var i = 0; i < t.length; i++) {
                        var o = t[i];
                        if ("string" != typeof o) {
                            var s = v(o, e + 1);
                            if (s.length < 10 * (d - c * e) && s.indexOf('"""') < 0) {
                                var a = y(o);
                                a.length < d - c * e && (o = "   " + a, s = "")
                            }
                            s && (n = 1e4), r += s
                        }
                        if ("string" == typeof o)
                            if (c * e + 4 > n) r = r.slice(0, -1) + " " + o + "\n", n += o.length + 1;
                            else {
                                var a = m(c * e) + o;
                                r += a + "\n", n = a.length
                            }
                    }
                    return r
                };
            n = n.bind(this), s = s.bind(this), a = a.bind(this), h = h.bind(this), u = u.bind(this);
            var g = n(r),
                w = "<rdf:RDF";
            this.defaultNamespace && (w += ' xmlns="' + i(this.defaultNamespace) + '"');
            for (var b in f) f.hasOwnProperty(b) && (w += "\n xmlns:" + this.prefixes[b] + '="' + i(b) + '"');
            w += ">";
            var x = [w, g, "</rdf:RDF>"];
            return v(x, -1)
        };
        var a = function(t) { return new o(t) };
        return a
    }();
    var e, r, n, c = function(t, e) { return function() { return t.apply(e, arguments) } },
        l = {}.hasOwnProperty;
    if (("undefined" == typeof e || null === e) && (e = {}), e.UpdatesSocket = function() {
            function t(t, e) {
                var r;
                this.parent = t, this.via = e, this.subscribe = c(this.subscribe, this), this.onError = c(this.onError, this), this.onMessage = c(this.onMessage, this), this.onClose = c(this.onClose, this), this.onOpen = c(this.onOpen, this), this._subscribe = c(this._subscribe, this), this._send = c(this._send, this), this.connected = !1, this.pending = {}, this.subscribed = {}, this.socket = {};
            }
            return t.prototype._decode = function(t) {
                var e, r, n, i, o, s, a;
                i = {}, s = function() { var r, n, i, o; for (i = t.split("&"), o = [], r = 0, n = i.length; n > r; r++) e = i[r], o.push(e.split("=")); return o }();
                for (r in s) e = s[r], a = [decodeURIComponent(e[0]), decodeURIComponent(e[1])], n = a[0], o = a[1], null == i[n] && (i[n] = []), i[n].push(o);
                return i
            }, t.prototype._send = function(t, e, r) { var n, i; return n = [t, e, r].join(" "), "function" == typeof(i = this.socket).send ? i.send(n) : void 0 }, t.prototype._subscribe = function(t) { return this._send("sub", t, ""), this.subscribed[t] = !0 }, t.prototype.onOpen = function() {
                var t, e;
                this.connected = !0, e = [];
                for (t in this.pending) delete this.pending[t], e.push(this._subscribe(t));
                return e
            }, t.prototype.onClose = function() {
                var t;
                this.connected = !1;
                for (t in this.subscribed) this.pending[t] = !0;
                return this.subscribed = {}
            }, t.prototype.onMessage = function(t) { var e, r; return e = t.data.split(" "), "ping" === e[0] ? "function" == typeof(r = this.socket).send ? r.send("pong " + e.slice(1).join(" ")) : void 0 : "pub" === e[0] ? this.parent.onUpdate(e[1], this._decode(e[2])) : void 0 }, t.prototype.onError = function(t) { throw "onError" + t }, t.prototype.subscribe = function(t) { return this.connected ? this._subscribe(t) : this.pending[t] = !0 }, t
        }(), e.UpdatesVia = function() {
            function t(t) { this.fetcher = t, this.onUpdate = c(this.onUpdate, this), this.onHeaders = c(this.onHeaders, this), this.register = c(this.register, this), this.graph = {}, this.via = {}, this.fetcher.addCallback("headers", this.onHeaders) }
            return t.prototype.register = function(t, r) { return null == this.via[t] && (this.via[t] = new e.UpdatesSocket(this, t)), this.via[t].subscribe(r) }, t.prototype.onHeaders = function(t) { var e, r, n; return null == t.headers ? !0 : "undefined" == typeof WebSocket || null === WebSocket ? !0 : (e = t.headers.etag, n = t.headers["updates-via"], r = t.uri, e && n && (this.graph[r] = { etag: e, via: n }, this.register(n, r)), !0) }, t.prototype.onUpdate = function(t) { return this.fetcher.refresh(e.sym(t)) }, t
        }(), null != ("undefined" != typeof module && null !== module ? module.exports : void 0))
        for (r in e) l.call(e, r) && (n = e[r], module.exports[r] = n);
    if ("undefined" != typeof module && module.require && (e.jsonld = require("jsonld"), p = require("n3"), d = require("async")), e.Fetcher = function(t, r, n) {
            this.store = t, this.thisURI = "http://dig.csail.mit.edu/2005/ajar/ajaw/rdf/sources.js#SourceFetcher", this.timeout = r ? r : 3e4, this.async = null != n ? n : !0, this.appNode = this.store.bnode(), this.store.fetcher = this, this.requested = {}, this.lookedUp = {}, this.handlers = [], this.mediatypes = {};
            var i = this,
                o = this.store,
                s = {};
            s.link = e.Namespace("http://www.w3.org/2007/ont/link#"), s.http = e.Namespace("http://www.w3.org/2007/ont/http#"), s.httph = e.Namespace("http://www.w3.org/2007/ont/httph#"), s.rdf = e.Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#"), s.rdfs = e.Namespace("http://www.w3.org/2000/01/rdf-schema#"), s.dc = e.Namespace("http://purl.org/dc/elements/1.1/"), e.Fetcher.crossSiteProxy = function(t) { return e.Fetcher.crossSiteProxyTemplate ? e.Fetcher.crossSiteProxyTemplate.replace("{uri}", encodeURIComponent(t)) : void 0 }, e.Fetcher.RDFXMLHandler = function(t) {
                t && (this.dom = t[0]), this.handlerFactory = function(t) {
                    t.handle = function(r) {
                        var n = i.store;
                        this.dom || (this.dom = e.Util.parseXML(t.responseText));
                        var o = this.dom.documentElement;
                        if ("parsererror" == o.nodeName) throw i.failFetch(t, "Badly formed XML in " + t.resource.uri), new Error("Badly formed XML in " + t.resource.uri);
                        var a = n.any(t.req, s.link("requestedURI"));
                        a = a ? n.sym(a.value) : t.resource;
                        var l = new e.RDFParser(n);
                        l.parse(this.dom, a.uri, a), n.add(a, s.rdf("type"), s.link("RDFDocument"), i.appNode), r()
                    }
                }
            }, e.Fetcher.RDFXMLHandler.term = this.store.sym(this.thisURI + ".RDFXMLHandler"), e.Fetcher.RDFXMLHandler.toString = function() { return "RDFXMLHandler" }, e.Fetcher.RDFXMLHandler.register = function(t) { t.mediatypes["application/rdf+xml"] = {} }, e.Fetcher.RDFXMLHandler.pattern = new RegExp("application/rdf\\+xml"), e.Fetcher.doGRDDL = function(t, e, r, n) { i.requestURI("http://www.w3.org/2005/08/online_xslt/xslt?xslfile=" + escape(r) + "&xmlfile=" + escape(n), e) }, e.Fetcher.XHTMLHandler = function(t) {
                t && (this.dom = t[0]), this.handlerFactory = function(t) {
                    t.handle = function(r) {
                        if (!this.dom) {
                            var n;
                            n = "undefined" != typeof tabulator && tabulator.isExtension ? Components.classes["@mozilla.org/xmlextras/domparser;1"].getService(Components.interfaces.nsIDOMParser) : new DOMParser, this.dom = n.parseFromString(t.responseText, "application/xml")
                        }
                        var o = i.store,
                            a = this.dom.getElementsByTagName("title");
                        a.length > 0 && o.add(t.resource, s.dc("title"), o.literal(a[0].textContent), t.resource);
                        for (var l = this.dom.getElementsByTagName("link"), h = l.length - 1; h >= 0; h--) i.linkData(t, l[h].getAttribute("rel"), l[h].getAttribute("href"));
                        var u = this.dom.getElementsByTagName("head")[0];
                        if (u) {
                            var c = u.getAttribute("profile");
                            c && "http" == e.uri.protocol(c) && e.Fetcher.doGRDDL(o, t.resource, "http://www.w3.org/2003/11/rdf-in-xhtml-processor", t.resource.uri)
                        }
                        o.add(t.resource, s.rdf("type"), s.link("WebPage"), i.appNode), e.rdfa && e.rdfa.parse && e.rdfa.parse(this.dom, o, t.resource.uri), r()
                    }
                }
            }, e.Fetcher.XHTMLHandler.term = this.store.sym(this.thisURI + ".XHTMLHandler"), e.Fetcher.XHTMLHandler.toString = function() { return "XHTMLHandler" }, e.Fetcher.XHTMLHandler.register = function(t) { t.mediatypes["application/xhtml+xml"] = { q: .3 } }, e.Fetcher.XHTMLHandler.pattern = new RegExp("application/xhtml"), e.Fetcher.XMLHandler = function() {
                this.handlerFactory = function(t) {
                    t.handle = function(r) {
                        var n, o = i.store;
                        n = "undefined" != typeof tabulator && tabulator.isExtension ? Components.classes["@mozilla.org/xmlextras/domparser;1"].getService(Components.interfaces.nsIDOMParser) : new DOMParser;
                        for (var s = n.parseFromString(t.responseText, "application/xml"), a = 0; a < s.childNodes.length; a++)
                            if (1 == s.childNodes[a].nodeType) {
                                var l = s.childNodes[a].namespaceURI;
                                if (void 0 != l && l == l.rdf) return i.addStatus(t.req, "Has XML root element in the RDF namespace, so assume RDF/XML."), void i.switchHandler("RDFXMLHandler", t, r, [s]);
                                for (var h = o.each(o.sym(l), o.sym("http://www.w3.org/2003/g/data-view#namespaceTransformation")), u = 0; u < h.length; u++) {
                                    var c = h[u];
                                    e.Fetcher.doGRDDL(o, t.resource, c.uri, t.resource.uri)
                                }
                                break
                            }
                        if (s.doctype && "html" == s.doctype.name && s.doctype.publicId.match(/^-\/\/W3C\/\/DTD XHTML/) && s.doctype.systemId.match(/http:\/\/www.w3.org\/TR\/xhtml/)) return i.addStatus(t.req, "Has XHTML DOCTYPE. Switching to XHTML Handler.\n"), void i.switchHandler("XHTMLHandler", t, r);
                        var d = s.getElementsByTagName("html")[0];
                        if (d) { var f = d.getAttribute("xmlns"); if (f && f.match(/^http:\/\/www.w3.org\/1999\/xhtml/)) return i.addStatus(t.req, "Has a default namespace for XHTML. Switching to XHTMLHandler.\n"), void i.switchHandler("XHTMLHandler", t, r) }
                        i.failFetch(t, "Unsupported dialect of XML: not RDF or XHTML namespace, etc.\n" + t.responseText.slice(0, 80))
                    }
                }
            }, e.Fetcher.XMLHandler.term = this.store.sym(this.thisURI + ".XMLHandler"), e.Fetcher.XMLHandler.toString = function() { return "XMLHandler" }, e.Fetcher.XMLHandler.register = function(t) { t.mediatypes["text/xml"] = { q: .2 }, t.mediatypes["application/xml"] = { q: .2 } }, e.Fetcher.XMLHandler.pattern = new RegExp("(text|application)/(.*)xml"), e.Fetcher.HTMLHandler = function() {
                this.handlerFactory = function(t) {
                    t.handle = function(e) {
                        var r = t.responseText;
                        if (r.match(/\s*<\?xml\s+version\s*=[^<>]+\?>/)) return i.addStatus(t.req, "Has an XML declaration. We'll assume it's XHTML as the content-type was text/html.\n"), void i.switchHandler("XHTMLHandler", t, e);
                        if (r.match(/.*<!DOCTYPE\s+html[^<]+-\/\/W3C\/\/DTD XHTML[^<]+http:\/\/www.w3.org\/TR\/xhtml[^<]+>/)) return i.addStatus(t.req, "Has XHTML DOCTYPE. Switching to XHTMLHandler.\n"), void i.switchHandler("XHTMLHandler", t, e);
                        if (r.match(/[^(<html)]*<html\s+[^<]*xmlns=['"]http:\/\/www.w3.org\/1999\/xhtml["'][^<]*>/)) return i.addStatus(t.req, "Has default namespace for XHTML, so switching to XHTMLHandler.\n"), void i.switchHandler("XHTMLHandler", t, e);
                        var n = new RegExp("<title>([\\s\\S]+?)</title>", "im").exec(r);
                        if (n) { var o = i.store; return o.add(t.resource, s.dc("title"), o.literal(n[1]), t.resource), o.add(t.resource, s.rdf("type"), s.link("WebPage"), i.appNode), void e() }
                        i.failFetch(t, "Sorry, can't yet parse non-XML HTML")
                    }
                }
            }, e.Fetcher.HTMLHandler.term = this.store.sym(this.thisURI + ".HTMLHandler"), e.Fetcher.HTMLHandler.toString = function() { return "HTMLHandler" }, e.Fetcher.HTMLHandler.register = function(t) { t.mediatypes["text/html"] = { q: .3 } }, e.Fetcher.HTMLHandler.pattern = new RegExp("text/html"), e.Fetcher.TextHandler = function() { this.handlerFactory = function(t) { t.handle = function(e) { var r = t.responseText; return r.match(/\s*<\?xml\s+version\s*=[^<>]+\?>/) ? (i.addStatus(t.req, "Warning: " + t.resource + " has an XML declaration. We'll assume it's XML but its content-type wasn't XML.\n"), void i.switchHandler("XMLHandler", t, e)) : r.slice(0, 500).match(/xmlns:/) ? (i.addStatus(t.req, "May have an XML namespace. We'll assume it's XML but its content-type wasn't XML.\n"), void i.switchHandler("XMLHandler", t, e)) : (i.addStatus(t.req, "Plain text document, no known RDF semantics."), void i.doneFetch(t, [t.resource.uri])) } } }, e.Fetcher.TextHandler.term = this.store.sym(this.thisURI + ".TextHandler"), e.Fetcher.TextHandler.toString = function() { return "TextHandler" }, e.Fetcher.TextHandler.register = function(t) { t.mediatypes["text/plain"] = { q: .1 } }, e.Fetcher.TextHandler.pattern = new RegExp("text/plain"), e.Fetcher.N3Handler = function() {
                this.handlerFactory = function(t) {
                    t.handle = function() {
                        e.log.debug("web.js: Parsing as N3 " + t.resource.uri);
                        var r = (t.responseText, e.N3Parser(o, o, t.resource.uri, t.resource.uri, null, null, "", null));
                        try { r.loadBuf(t.responseText) } catch (n) { var a = "Error trying to parse " + t.resource + " as Notation3:\n" + n + ":\n" + n.stack; return void i.failFetch(t, a) }
                        i.addStatus(t.req, "N3 parsed: " + r.statementCount + " triples in " + r.lines + " lines."), i.store.add(t.resource, s.rdf("type"), s.link("RDFDocument"), i.appNode), args = [t.resource.uri], i.doneFetch(t, args)
                    }
                }
            }, e.Fetcher.N3Handler.term = this.store.sym(this.thisURI + ".N3Handler"), e.Fetcher.N3Handler.toString = function() { return "N3Handler" }, e.Fetcher.N3Handler.register = function(t) { t.mediatypes["text/n3"] = { q: "1.0" }, t.mediatypes["application/x-turtle"] = { q: 1 }, t.mediatypes["text/turtle"] = { q: 1 } }, e.Fetcher.N3Handler.pattern = new RegExp("(application|text)/(x-)?(rdf\\+)?(n3|turtle)"), e.Util.callbackify(this, ["request", "recv", "headers", "load", "fail", "refresh", "retract", "done"]), this.addProtocol = function(t) { i.store.add(i.appNode, s.link("protocol"), i.store.literal(t), this.appNode) }, this.addHandler = function(t) { i.handlers.push(t), t.register(i) }, this.switchHandler = function(t, r, n, o) {
                for (var s = (this.store, null), a = 0; a < this.handlers.length; a++) "" + this.handlers[a] == t && (s = this.handlers[a]);
                if (void 0 == s) throw "web.js: switchHandler: name=" + t + " , this.handlers =" + this.handlers + "\nswitchHandler: switching to " + s + "; sf=" + i + "; typeof $rdf.Fetcher=" + typeof e.Fetcher + ";\n	 $rdf.Fetcher.HTMLHandler=" + e.Fetcher.HTMLHandler + "\n\n	sf.handlers=" + i.handlers + "\n";
                new s(o).handlerFactory(r), r.handle(n)
            }, this.addStatus = function(t, r) {
                var n = new Date;
                r = "[" + n.getHours() + ":" + n.getMinutes() + ":" + n.getSeconds() + "." + n.getMilliseconds() + "] " + r;
                var i = this.store,
                    o = i.the(t, s.link("status"));
                o && o.append ? o.append(i.literal(r)) : e.log.warn("web.js: No list to add to: " + o + "," + r)
            }, this.failFetch = function(t, r) { return this.addStatus(t.req, r), o.add(t.resource, s.link("error"), r), this.requested[e.uri.docpart(t.resource.uri)] = !1, t.userCallback && t.userCallback(!1, "Fetch of <" + t.resource.uri + "> failed: " + r, t), this.fireCallbacks("fail", [t.requestedURI, r]), t.abort(), t }, this.linkData = function(t, r, n) {
                t.resource;
                if (n && ("alternate" == r || "seeAlso" == r || "meta" == r || "describedby" == r)) {
                    var i = o.sym(e.uri.join(n, t.resource.uri));
                    i.uri != t.resource && o.add(t.resource, s.rdfs("seeAlso"), i, t.resource)
                }
            }, this.doneFetch = function(t, e) { this.addStatus(t.req, "Done."), this.requested[t.resource.uri] = "done", t.userCallback && t.userCallback(!0, void 0, t), this.fireCallbacks("done", e) }, this.store.add(this.appNode, s.rdfs("label"), this.store.literal("This Session"), this.appNode), ["http", "https", "file", "chrome"].map(this.addProtocol), [e.Fetcher.RDFXMLHandler, e.Fetcher.XHTMLHandler, e.Fetcher.XMLHandler, e.Fetcher.HTMLHandler, e.Fetcher.TextHandler, e.Fetcher.N3Handler].map(this.addHandler), this.nowKnownAs = function(t, e) { this.lookedUp[t.uri] ? this.lookedUp[e.uri] || this.lookUpThing(e, t) : this.lookedUp[e.uri] && (this.lookedUp[t.uri] || this.lookUpThing(t, e)) }, this.lookUpThing = function(t, r, n, i, s) {
                var a = o.uris(t),
                    l = !0,
                    h = "",
                    u = {};
                if ("undefined" != typeof a)
                    for (var c = 0; c < a.length; c++) {
                        var d = a[c];
                        u[d] = !0, this.lookedUp[d] = !0;
                        var f = this,
                            p = function(t) {
                                f.requestURI(e.uri.docpart(t), r, n, function(e, r) {
                                    e ? i && i(!0, t) : (i && i(!1, r), l = !1, h += r + "\n"), delete u[d];
                                    for (x in u) return;
                                    s && s(l, h)
                                })
                            };
                        p(d)
                    }
                return a.length
            }, this.nowOrWhenFetched = function(t, e, r) { t = t.indexOf("#") >= 0 ? t.slice(0, t.indexOf("#")) : t; var n = this.getState(t); return "fetched" == n ? r(!0) : void this.requestURI(t, e, !1, r) }, this.getHeader = function(t, e) { for (var r = this.store, n = r.each(void 0, s.link("requestedURI"), t.uri), i = 0; i < n.length; i++) { var o = n[i]; if (void 0 !== o) { var a = r.any(o, s.link("response")); if (void 0 !== o) { var l = r.each(a, s.httph(e.toLowerCase())); return l.length ? l.map(function(t) { return t.value }) : [] } } } return void 0 }, this.proxyIfNecessary = function(t) { return "undefined" != typeof tabulator && tabulator.isExtension ? t : e.Fetcher.crossSiteProxyTemplate && document && document.location && "https:" === ("" + document.location).slice(0, 6) && "http:" === t.slice(0, 5) ? e.Fetcher.crossSiteProxyTemplate.replace("{uri}", encodeURIComponent(t)) : t }, this.saveRequestMetadata = function(t, r, n) {
                var i = r.bnode();
                t.resource = e.sym(n), t.req = i;
                var o = new Date,
                    a = "[" + o.getHours() + ":" + o.getMinutes() + ":" + o.getSeconds() + "] ";
                return r.add(i, s.rdfs("label"), r.literal(a + " Request for " + n), this.appNode), r.add(i, s.link("requestedURI"), r.literal(n), this.appNode), r.add(i, s.link("status"), r.collection(), this.appNode), i
            }, this.saveResponseMetadata = function(t, r) { var n = r.bnode(); if (r.add(t.req, s.link("response"), n), r.add(n, s.http("status"), r.literal(t.status), n), r.add(n, s.http("statusText"), r.literal(t.statusText), n), t.headers = {}, "http" == e.uri.protocol(t.resource.uri) || "https" == e.uri.protocol(t.resource.uri)) { t.headers = e.Util.getHTTPHeaders(t); for (var i in t.headers) r.add(n, s.httph(i.toLowerCase()), t.headers[i].trim(), n) } return n }, this.requestURI = function(t, r, n, i) {
                if (t.indexOf("#") >= 0) throw "requestURI should not be called with fragid: " + t;
                var o = e.uri.protocol(t);
                if ("tel" == o || "mailto" == o || "urn" == o) return null;
                var n = !!n,
                    a = this.store,
                    l = arguments,
                    h = a.sym(t);
                if (!n && "undefined" != typeof this.requested[t]) return null;
                this.fireCallbacks("request", l), this.requested[t] = !0, r && r.uri && a.add(h.uri, s.link("requestedBy"), r.uri, this.appNode);
                var u = "undefined" != typeof jQuery;
                if (u) var c = a.bnode();
                else {
                    var d = e.Util.XMLHTTPFactory(),
                        c = d.req = a.bnode();
                    d.resource = h, d.requestedURI = l[0]
                }
                var f = a.collection(),
                    p = this,
                    m = new Date,
                    y = "[" + m.getHours() + ":" + m.getMinutes() + ":" + m.getSeconds() + "] ";
                a.add(c, s.rdfs("label"), a.literal(y + " Request for " + t), this.appNode), a.add(c, s.link("requestedURI"), a.literal(t), this.appNode), a.add(c, s.link("status"), a.collection(), this.appNode);
                var v = function(t) {
                        return function(r) {
                            if (e.Fetcher.crossSiteProxyTemplate && document && document.location && !t.proxyUsed) {
                                var o = e.uri.hostpart,
                                    a = "" + document.location,
                                    l = t.resource.uri;
                                if (o(a) && o(l) && o(a) != o(l))
                                    if (401 === t.status || 403 === t.status || 404 === t.status) g(t)();
                                    else {
                                        if (newURI = e.Fetcher.crossSiteProxy(l), p.addStatus(t.req, "BLOCKED -> Cross-site Proxy to <" + newURI + ">"), t.aborted) return;
                                        var h = p.store,
                                            u = t.req;
                                        h.add(u, s.http("redirectedTo"), h.sym(newURI), u), t.abort(), t.aborted = !0, p.addStatus(u, "done - redirected"), p.requested[t.resource.uri] = "redirected";
                                        var c = p.requestURI(newURI, t.resource, n, i);
                                        if (c.proxyUsed = !0, c && c.req) return void h.add(t.req, h.sym("http://www.w3.org/2007/ont/link#redirectedRequest"), c.req, p.appNode)
                                    }
                            } else t.withCredentials ? (console.log("@@ Retrying with no credentials for " + t.resource), t.abort(), t.withCredentials = !1, p.addStatus(t.req, "Credentials SUPPRESSED to see if that helps"), t.send()) : p.failFetch(t, "XHR Error: " + r)
                        }
                    },
                    g = function(r) {
                        return function() {
                            var i = function() {
                                if (!r.handleResponseDone) {
                                    r.handleResponseDone = !0;
                                    var i = null,
                                        o = r.req;
                                    p.fireCallbacks("recv", l);
                                    var a = p.store;
                                    if (p.saveResponseMetadata(r, a), p.fireCallbacks("headers", [{ uri: t, headers: r.headers }]), r.status >= 400) {
                                        if (r.responseText.length > 10) {
                                            var h = a.bnode();
                                            a.add(h, s.http("content"), a.literal(r.responseText), h), r.statusText && a.add(h, s.http("statusText"), a.literal(r.statusText), h)
                                        }
                                        return void p.failFetch(r, "HTTP error for " + r.resource + ": " + r.status + " " + r.statusText)
                                    }
                                    var u = r.headers["content-location"],
                                        c = function(t) {
                                            var e = o;
                                            if (u) {
                                                var r = a.any(e, s.link("requestedURI"));
                                                r != u && a.add(a.sym(u), s.rdf("type"), t, p.appNode)
                                            }
                                            for (;;) { var n = a.any(e, s.link("requestedURI")); if (n && n.value && a.add(a.sym(n.value), s.rdf("type"), t, p.appNode), e = a.any(void 0, a.sym("http://www.w3.org/2007/ont/link#redirectedRequest"), e), !e) break; var i = a.any(e, a.sym("http://www.w3.org/2007/ont/link#response")); if (!i) break; var l = a.any(i, a.sym("http://www.w3.org/2007/ont/http#status")); if (!l) break; if ("301" != l && "302" != l) break }
                                        };
                                    if (200 == r.status) {
                                        c(s.link("Document"));
                                        var d = r.headers["content-type"];
                                        d && (0 == d.indexOf("image/") || 0 == d.indexOf("application/pdf")) && c(a.sym("http://purl.org/dc/terms/Image"))
                                    }
                                    if ("file" == e.uri.protocol(r.resource.uri) || "chrome" == e.uri.protocol(r.resource.uri)) switch (r.resource.uri.split(".").pop()) {
                                        case "rdf":
                                        case "owl":
                                            r.headers["content-type"] = "application/rdf+xml";
                                            break;
                                        case "n3":
                                        case "nt":
                                        case "ttl":
                                            r.headers["content-type"] = "text/n3";
                                            break;
                                        default:
                                            r.headers["content-type"] = "text/xml"
                                    }
                                    if (u) {
                                        var m = e.uri.join(r.resource.uri, u);
                                        if (!n && m != r.resource.uri && p.requested[m]) return p.doneFetch(r, l), void r.abort();
                                        p.requested[m] = !0
                                    }
                                    for (var y = 0; y < p.handlers.length; y++)
                                        if (r.headers["content-type"] && r.headers["content-type"].match(p.handlers[y].pattern)) { i = new p.handlers[y], f.append(p.handlers[y].term); break }
                                    var v;
                                    try { v = r.getResponseHeader("link") } catch (g) {}
                                    if (v) {
                                        for (var w = null, b = v.replace(/ /g, "").split(";"), x = 1; x < b.length; x++) lr = b[x].split("="), "rel" == lr[0] && (w = lr[1]);
                                        var T = b[0];
                                        T.length && "<" == T[0] && ">" == T[T.length - 1] && T.slice && (T = T.slice(1, -1)), w && p.linkData(r, w, T)
                                    }
                                    if (!i) return void p.doneFetch(r, l);
                                    try { i.handlerFactory(r) } catch (g) { p.failFetch(r, "Exception handling content-type " + r.headers["content-type"] + " was: " + g) }
                                }
                            };
                            switch (r.readyState) {
                                case 0:
                                    var o, a = r.resource.uri;
                                    if (this.crossSiteProxyTemplate && document && document.location) {
                                        var h = e.uri.hostpart,
                                            u = "" + document.location;
                                        if (h(u) && h(a) && h(u) != h(a)) {
                                            if (o = this.crossSiteProxyTemplate.replace("{uri}", encodeURIComponent(a)), p.addStatus(r.req, "BLOCKED -> Cross-site Proxy to <" + o + ">"), r.aborted) return;
                                            var c = p.store,
                                                d = r.req;
                                            c.add(d, s.http("redirectedTo"), c.sym(o), d);
                                            var m = r.req = c.bnode();
                                            c.add(d, s.http("redirectedRequest"), m, r.req);
                                            var y = new Date,
                                                v = "[" + y.getHours() + ":" + y.getMinutes() + ":" + y.getSeconds() + "] ";
                                            c.add(m, s.rdfs("label"), c.literal(v + " Request for " + o), this.appNode), c.add(m, s.link("status"), c.collection(), this.appNode), c.add(m, s.link("requestedURI"), c.literal(o), this.appNode);
                                            var g = c.bnode();
                                            c.add(d, s.link("response"), g), r.abort(), r.aborted = !0, p.addStatus(d, "done"), r.userCallback && r.userCallback(!0), p.fireCallbacks("done", l), p.requested[r.resource.uri] = "redirected";
                                            var w = p.requestURI(o, r.resource);
                                            return void(w && w.req && c.add(r.req, c.sym("http://www.w3.org/2007/ont/link#redirectedRequest"), w.req, p.appNode))
                                        }
                                    }
                                    p.failFetch(r, "HTTP Blocked. (ReadyState 0) Cross-site violation for <" + t + ">");
                                    break;
                                case 3:
                                    break;
                                case 4:
                                    if (i(), r.handle) {
                                        if ("redirected" === p.requested[r.resource.uri]) break;
                                        p.fireCallbacks("load", l), r.handle(function() { p.doneFetch(r, l) })
                                    } else p.addStatus(r.req, "Fetch OK. No known semantics."), p.doneFetch(r, l)
                            }
                        }
                    },
                    w = t;
                "undefined" != typeof tabulator && tabulator.preferences.get("offlineModeUsingLocalhost") && "http://" == w.slice(0, 7) && "localhost/" != w.slice(7, 17) && (w = "http://localhost/" + w.slice(7), e.log.warn("Localhost kludge for offline use: actually getting <" + w + ">"));
                var b = "https:" === w.slice(0, 6),
                    x = this.proxyIfNecessary(w);
                if ("undefined" != typeof jQuery && jQuery.ajax) {
                    var d = jQuery.ajax({ url: x, accepts: { "*": "text/turtle,text/n3,application/rdf+xml" }, processData: !1, xhrFields: { withCredentials: b }, timeout: p.timeout, error: function(t, e, r) { t.req = c, t.userCallback = i, t.resource = h, t.requestedURI = w, t.withCredentials = b, "timeout" == e ? p.failFetch(t, "requestTimeout") : v(t)(r) }, success: function(t, e, r) { r.req = c, r.userCallback = i, r.resource = h, r.requestedURI = w, g(r)() } });
                    d.req = c, d.userCallback = i, d.resource = h, d.requestedURI = w, d.actualProxyURI = x
                } else {
                    var d = e.Util.XMLHTTPFactory();
                    d.onerror = v(d), d.onreadystatechange = g(d), d.timeout = p.timeout, d.withCredentials = b, d.actualProxyURI = x, d.req = c, d.userCallback = i, d.resource = h, d.requestedURI = w, d.ontimeout = function() { p.failFetch(d, "requestTimeout") };
                    try { d.open("GET", x, this.async) } catch (T) { return this.failFetch(d, "XHR open for GET failed for <" + w + ">:\n	" + T) }
                }
                if ("undefined" != typeof tabulator && tabulator.isExtension && d.channel && ("http" == e.uri.protocol(d.resource.uri) || "https" == e.uri.protocol(d.resource.uri))) try {
                    d.channel.notificationCallbacks = {
                        getInterface: function(t) {
                            return t.equals(Components.interfaces.nsIChannelEventSink) ? {
                                onChannelRedirect: function(t, n) {
                                    if (!d.aborted) {
                                        var i = p.store,
                                            o = n.URI.spec,
                                            a = d.req;
                                        p.addStatus(d.req, "Redirected: " + d.status + " to <" + o + ">"), i.add(a, s.http("redirectedTo"), i.sym(o), d.req);
                                        var h = d.req = i.bnode();
                                        i.add(a, s.http("redirectedRequest"), h, this.appNode);
                                        var u = new Date,
                                            c = "[" + u.getHours() + ":" + u.getMinutes() + ":" + u.getSeconds() + "] ";
                                        i.add(h, s.rdfs("label"), i.literal(c + " Request for " + o), this.appNode), i.add(h, s.link("status"), i.collection(), this.appNode), i.add(h, s.link("requestedURI"), i.literal(o), this.appNode);
                                        var f = i.bnode();
                                        if (i.add(a, s.link("response"), f), i.add(f, s.http("status"), i.literal(d.status), f), d.statusText && i.add(f, s.http("statusText"), i.literal(d.statusText), f), d.status - 0 != 303 && (i.HTTPRedirects[d.resource.uri] = o), d.status - 0 == 301 && r) {
                                            var m = e.uri.docpart(r.uri),
                                                y = "Warning: " + d.resource + " has moved to <" + o + ">.";
                                            r && (y += " Link in <" + m + " >should be changed", i.add(m, i.sym("http://www.w3.org/2007/ont/link#warning"), y, p.appNode))
                                        }
                                        d.abort(), d.aborted = !0, p.addStatus(a, "done"), p.fireCallbacks("done", l), p.requested[d.resource.uri] = "redirected";
                                        var v = o.indexOf("#");
                                        if (v >= 0) {
                                            var y = "Warning: " + d.resource + " HTTP redirects to" + o + ' which should not contain a "#" sign';
                                            i.add(d.resource, i.sym("http://www.w3.org/2007/ont/link#warning"), y), o = o.slice(0, v)
                                        }
                                        var g = p.requestURI(o, d.resource);
                                        g && g.req && i.add(d.req, i.sym("http://www.w3.org/2007/ont/link#redirectedRequest"), g.req, p.appNode)
                                    }
                                },
                                asyncOnChannelRedirect: function(t, n) {
                                    if (!d.aborted) {
                                        var i = p.store,
                                            o = n.URI.spec,
                                            a = d.req;
                                        p.addStatus(d.req, "Redirected: " + d.status + " to <" + o + ">"), i.add(a, s.http("redirectedTo"), i.sym(o), d.req);
                                        var h = d.req = i.bnode();
                                        i.add(a, s.http("redirectedRequest"), h, d.req);
                                        var u = new Date,
                                            c = "[" + u.getHours() + ":" + u.getMinutes() + ":" + u.getSeconds() + "] ";
                                        i.add(h, s.rdfs("label"), i.literal(c + " Request for " + o), this.appNode), i.add(h, s.link("status"), i.collection(), this.appNode), i.add(h, s.link("requestedURI"), i.literal(o), this.appNode);
                                        var f = i.bnode();
                                        if (i.add(a, s.link("response"), f), i.add(f, s.http("status"), i.literal(d.status), f), d.statusText && i.add(f, s.http("statusText"), i.literal(d.statusText), f), d.status - 0 != 303 && (i.HTTPRedirects[d.resource.uri] = o), d.status - 0 == 301 && r) {
                                            var m = e.uri.docpart(r.uri),
                                                y = "Warning: " + d.resource + " has moved to <" + o + ">.";
                                            r && (y += " Link in <" + m + " >should be changed", i.add(m, i.sym("http://www.w3.org/2007/ont/link#warning"), y, p.appNode))
                                        }
                                        d.abort(), d.aborted = !0, p.addStatus(a, "done"), d.userCallback && d.userCallback(!0), p.fireCallbacks("done", l), p.requested[d.resource.uri] = "redirected";
                                        var v = o.indexOf("#");
                                        if (v >= 0) {
                                            var y = "Warning: " + d.resource + " HTTP redirects to" + o + ' which should not contain a "#" sign';
                                            i.add(d.resource, i.sym("http://www.w3.org/2007/ont/link#warning"), y), o = o.slice(0, v)
                                        }
                                        var g = p.requestURI(o, d.resource);
                                        g && g.req && i.add(d.req, i.sym("http://www.w3.org/2007/ont/link#redirectedRequest"), g.req, p.appNode)
                                    }
                                }
                            } : Components.results.NS_NOINTERFACE
                        }
                    }
                } catch (N) { return p.failFetch(d, "@@ Couldn't set callback for redirects: " + N) }
                try {
                    var S = "";
                    for (var _ in this.mediatypes) { "" != S && (S += ", "), S += _; for (var k in this.mediatypes[_]) S += ";" + k + "=" + this.mediatypes[_][k] }
                    d.setRequestHeader("Accept", S)
                } catch (N) { throw "Can't set Accept header: " + N }
                if (u) this.addStatus(d.req, "HTTP Request sent (using jQuery)");
                else {
                    try { d.send(null) } catch (T) { return this.failFetch(d, "XHR send failed:" + T) }
                    setTimeout(function() { 4 != d.readyState && p.isPending(d.resource.uri) && p.failFetch(d, "requestTimeout") }, this.timeout), this.addStatus(d.req, "HTTP Request sent.")
                }
                return d
            }, this.objectRefresh = function(t) {
                var r = o.uris(t);
                if ("undefined" != typeof r)
                    for (var n = 0; n < r.length; n++) this.refresh(this.store.sym(e.uri.docpart(r[n])))
            }, this.unload = function(t) { this.store.removeMany(void 0, void 0, void 0, t), delete this.requested[t.uri] }, this.refresh = function(t) { this.unload(t), this.fireCallbacks("refresh", arguments), this.requestURI(t.uri, void 0, !0) }, this.retract = function(t) { this.store.removeMany(void 0, void 0, void 0, t), t.uri && delete this.requested[e.uri.docpart(t.uri)], this.fireCallbacks("retract", arguments) }, this.getState = function(t) { return "undefined" != typeof this.requested[t] ? this.requested[t] ? this.isPending(t) ? "requested" : "fetched" : "failed" : "unrequested" }, this.isPending = function(t) { return 1 == this.requested[t] };
            new e.UpdatesVia(this)
        }, e.fetcher = function(t, r, n) { return new e.Fetcher(t, r, n) }, e.parse = function(t, r, n, i) { try { if ("text/n3" == i || "text/turtle" == i) { var o = e.N3Parser(r, r, n, n, null, null, "", null); return void o.loadBuf(t) } if ("application/rdf+xml" == i) { var s = new e.RDFParser(r); return void s.parse(e.Util.parseXML(t), n, r.sym(n)) } if ("application/rdfa" == i) return void(e.rdfa && e.rdfa.parse && e.rdfa.parse(e.Util.parseXML(t), r, n)); if ("application/sparql-update" == i) return spaqlUpdateParser(store, t, n), void(e.rdfa && e.rdfa.parse && e.rdfa.parse(e.Util.parseXML(t), r, n)) } catch (a) { throw "Error trying to parse <" + n + "> as " + i + ":\n" + a + ":\n" + a.stack } throw "Don't know how to parse " + i + " yet" }, e.serialize = function(t, r, n, i, o) {
            var s, a = e.Serializer(r),
                l = r.statementsMatching(void 0, void 0, void 0, t);
            switch (a.suggestNamespaces(r.namespaces), a.setBase(n), i) {
                case "application/rdf+xml":
                    s = a.statementsToXML(l);
                    break;
                case "text/n3":
                case "text/turtle":
                case "application/x-turtle":
                case "application/n3":
                    s = a.statementsToN3(l);
                    break;
                case "application/json+ld":
                    var h = a.statementsToN3(l);
                    m(h, o);
                    break;
                case "application/n-quads":
                case "application/nquads":
                    var h = a.statementsToN3(l);
                    s = v(h, o);
                    break;
                default:
                    throw "serialise: Content-type " + content_type + " not supported for data write"
            }
            return s
        }, "undefined" != typeof module && module.require) var d = require("async"),
        f = require("jsonld"),
        p = require("n3"),
        m = function(t, e) {
            var r = void 0,
                n = p.Parser(),
                i = p.Writer({ format: "N-Quads" });
            d.waterfall([function(e) { n.parse(t, e) }, function(t, e, r) { null !== t && i.addTriple(t), "function" == typeof r && i.end(r) }, function(t, e) { try { f.fromRDF(t, { format: "application/nquads" }, e) } catch (r) { e(r) } }, function(t) { r = JSON.stringify(t), e(null, r) }], function(t) { e(t, r) })
        },
        v = function(t, e) {
            var r = void 0,
                n = p.Parser(),
                i = p.Writer({ format: "N-Quads" });
            d.waterfall([function(e) { n.parse(t, e) }, function(t, e, r) { null !== t && i.addTriple(t), "function" == typeof r && i.end(r) }, function(t) { r = t, e(null, r) }], function(t) { e(t, r) })
        };
    "undefined" != typeof exports ? ("undefined" != typeof module && module.exports && (exports = module.exports = e), exports.$rdf = e) : ("function" == typeof define && define.amd && define("ace/ext/rdflib",[], function() { return e }), t.$rdf = e)
}(this);

(function() {

    var StateMachine = {

        VERSION: "2.4.0",

        Result: {
            SUCCEEDED: 1, // the event transitioned successfully from one state to another
            NOTRANSITION: 2, // the event was successfull but no state transition was necessary
            CANCELLED: 3, // the event was cancelled by the caller in a beforeEvent callback
            PENDING: 4 // the event is asynchronous and the caller is in control of when the transition occurs
        },

        Error: {
            INVALID_TRANSITION: 100, // caller tried to fire an event that was innapropriate in the current state
            PENDING_TRANSITION: 200, // caller tried to fire an event while an async transition was still pending
            INVALID_CALLBACK: 300 // caller provided callback function threw an exception
        },

        WILDCARD: '*',
        ASYNC: 'async',

        create: function(cfg, target) {

            var initial = (typeof cfg.initial == 'string') ? { state: cfg.initial } : cfg.initial; // allow for a simple string, or an object with { state: 'foo', event: 'setup', defer: true|false }
            var terminal = cfg.terminal || cfg['final'];
            var fsm = target || cfg.target || {};
            var events = cfg.events || [];
            var callbacks = cfg.callbacks || {};
            var map = {}; // track state transitions allowed for an event { event: { from: [ to ] } }
            var transitions = {}; // track events allowed from a state            { state: [ event ] }

            var add = function(e) {
                var from = Array.isArray(e.from) ? e.from : (e.from ? [e.from] : [StateMachine.WILDCARD]); // allow 'wildcard' transition if 'from' is not specified
                map[e.name] = map[e.name] || {};
                for (var n = 0; n < from.length; n++) {
                    transitions[from[n]] = transitions[from[n]] || [];
                    transitions[from[n]].push(e.name);

                    map[e.name][from[n]] = e.to || from[n]; // allow no-op transition if 'to' is not specified
                }
                if (e.to)
                    transitions[e.to] = transitions[e.to] || [];
            };

            if (initial) {
                initial.event = initial.event || 'startup';
                add({ name: initial.event, from: 'none', to: initial.state });
            }

            for (var n = 0; n < events.length; n++)
                add(events[n]);

            for (var name in map) {
                if (map.hasOwnProperty(name))
                    fsm[name] = StateMachine.buildEvent(name, map[name]);
            }

            for (var name in callbacks) {
                if (callbacks.hasOwnProperty(name))
                    fsm[name] = callbacks[name]
            }

            fsm.current = 'none';
            fsm.is = function(state) { return Array.isArray(state) ? (state.indexOf(this.current) >= 0) : (this.current === state); };
            fsm.can = function(event) { return !this.transition && (map[event] !== undefined) && (map[event].hasOwnProperty(this.current) || map[event].hasOwnProperty(StateMachine.WILDCARD)); }
            fsm.cannot = function(event) { return !this.can(event); };
            fsm.transitions = function() { return (transitions[this.current] || []).concat(transitions[StateMachine.WILDCARD] || []); };
            fsm.isFinished = function() { return this.is(terminal); };
            fsm.error = cfg.error || function(name, from, to, args, error, msg, e) { throw e || msg; }; // default behavior when something unexpected happens is to throw an exception, but caller can override this behavior if desired (see github issue #3 and #17)
            fsm.states = function() { return Object.keys(transitions).sort() };

            if (initial && !initial.defer)
                fsm[initial.event]();

            return fsm;

        },

        doCallback: function(fsm, func, name, from, to, args) {
            if (func) {
                try {
                    return func.apply(fsm, [name, from, to].concat(args));
                } catch (e) {
                    return fsm.error(name, from, to, args, StateMachine.Error.INVALID_CALLBACK, "an exception occurred in a caller-provided callback function", e);
                }
            }
        },

        beforeAnyEvent: function(fsm, name, from, to, args) { return StateMachine.doCallback(fsm, fsm['onbeforeevent'], name, from, to, args); },
        afterAnyEvent: function(fsm, name, from, to, args) { return StateMachine.doCallback(fsm, fsm['onafterevent'] || fsm['onevent'], name, from, to, args); },
        leaveAnyState: function(fsm, name, from, to, args) { return StateMachine.doCallback(fsm, fsm['onleavestate'], name, from, to, args); },
        enterAnyState: function(fsm, name, from, to, args) { return StateMachine.doCallback(fsm, fsm['onenterstate'] || fsm['onstate'], name, from, to, args); },
        changeState: function(fsm, name, from, to, args) { return StateMachine.doCallback(fsm, fsm['onchangestate'], name, from, to, args); },

        beforeThisEvent: function(fsm, name, from, to, args) { return StateMachine.doCallback(fsm, fsm['onbefore' + name], name, from, to, args); },
        afterThisEvent: function(fsm, name, from, to, args) { return StateMachine.doCallback(fsm, fsm['onafter' + name] || fsm['on' + name], name, from, to, args); },
        leaveThisState: function(fsm, name, from, to, args) { return StateMachine.doCallback(fsm, fsm['onleave' + from], name, from, to, args); },
        enterThisState: function(fsm, name, from, to, args) { return StateMachine.doCallback(fsm, fsm['onenter' + to] || fsm['on' + to], name, from, to, args); },

        beforeEvent: function(fsm, name, from, to, args) {
            if ((false === StateMachine.beforeThisEvent(fsm, name, from, to, args)) ||
                (false === StateMachine.beforeAnyEvent(fsm, name, from, to, args)))
                return false;
        },

        afterEvent: function(fsm, name, from, to, args) {
            StateMachine.afterThisEvent(fsm, name, from, to, args);
            StateMachine.afterAnyEvent(fsm, name, from, to, args);
        },

        leaveState: function(fsm, name, from, to, args) {
            var specific = StateMachine.leaveThisState(fsm, name, from, to, args),
                general = StateMachine.leaveAnyState(fsm, name, from, to, args);
            if ((false === specific) || (false === general))
                return false;
            else if ((StateMachine.ASYNC === specific) || (StateMachine.ASYNC === general))
                return StateMachine.ASYNC;
        },

        enterState: function(fsm, name, from, to, args) {
            StateMachine.enterThisState(fsm, name, from, to, args);
            StateMachine.enterAnyState(fsm, name, from, to, args);
        },

        buildEvent: function(name, map) {
            return function() {

                var from = this.current;
                var to = map[from] || (map[StateMachine.WILDCARD] != StateMachine.WILDCARD ? map[StateMachine.WILDCARD] : from) || from;
                var args = Array.prototype.slice.call(arguments); // turn arguments into pure array

                if (this.transition)
                    return this.error(name, from, to, args, StateMachine.Error.PENDING_TRANSITION, "event " + name + " inappropriate because previous transition did not complete");

                if (this.cannot(name))
                    return this.error(name, from, to, args, StateMachine.Error.INVALID_TRANSITION, "event " + name + " inappropriate in current state " + this.current);

                if (false === StateMachine.beforeEvent(this, name, from, to, args))
                    return StateMachine.Result.CANCELLED;

                if (from === to) {
                    StateMachine.afterEvent(this, name, from, to, args);
                    return StateMachine.Result.NOTRANSITION;
                }
                var fsm = this;
                this.transition = function() {
                    fsm.transition = null; // this method should only ever be called once
                    fsm.current = to;
                    StateMachine.enterState(fsm, name, from, to, args);
                    StateMachine.changeState(fsm, name, from, to, args);
                    StateMachine.afterEvent(fsm, name, from, to, args);
                    return StateMachine.Result.SUCCEEDED;
                };
                this.transition.cancel = function() { // provide a way for caller to cancel async transition if desired (issue #22)
                    fsm.transition = null;
                    StateMachine.afterEvent(fsm, name, from, to, args);
                }

                var leave = StateMachine.leaveState(this, name, from, to, args);
                if (false === leave) {
                    this.transition = null;
                    return StateMachine.Result.CANCELLED;
                } else if (StateMachine.ASYNC === leave) {
                    return StateMachine.Result.PENDING;
                } else {
                    if (this.transition) // need to check in case user manually called transition() but forgot to return StateMachine.ASYNC
                        return this.transition();
                }

            };
        }

    }; // StateMachine
    if (typeof exports !== 'undefined') {
        if (typeof module !== 'undefined' && module.exports) {
            exports = module.exports = StateMachine;
        }
        exports.StateMachine = StateMachine;
    }
    else if (typeof define === 'function' && define.amd) {
        define("ace/ext/fsm",["require","exports","module"], function(require) { return StateMachine; });
    }
    else if (typeof window !== 'undefined') {
        window.StateMachine = StateMachine;
    }
    else if (typeof self !== 'undefined') {
        self.StateMachine = StateMachine;
    }

}());

define("ace/ext/n3-browser.min.js",["require","exports","module"], function(require, exports, module) {
var $build_deps$ = {require: require, exports: exports, module: module};
exports = undefined; module = undefined;
function define(name, deps, m) {
    if (typeof name == "function") {
        m = name; deps = ["require", "exports", "module"]; name = $build_deps$.module.id
    }
    if (typeof name !== "string") {
        m = deps; deps = name; name = $build_deps$.module.id
    }
    if (!m) {
        m = deps; deps = [];
    }
   var ret = typeof m == "function" ?
       m.apply($build_deps$.module, deps.map(function(n){return $build_deps$[n] || require(n)})) : m
   if (ret != undefined) $build_deps$.module.exports = ret;
}
define.amd = true;
!function(e){!function(){function t(e,t){for(var r in s)t?e.prototype[r]=i(s[r]):e[r]=s[r];return e}function i(e){return function(t){return e(this,t)}}var r="http://www.w3.org/2001/XMLSchema#",s={isIRI:function(e){if(!e)return e;var t=e[0];return'"'!==t&&"_"!==t},isLiteral:function(e){return e&&'"'===e[0]},isBlank:function(e){return e&&"_:"===e.substr(0,2)},isDefaultGraph:function(e){return!e},inDefaultGraph:function(e){return!e.graph},getLiteralValue:function(e){var t=/^"([^]*)"/.exec(e);if(!t)throw new Error(e+" is not a literal");return t[1]},getLiteralType:function(e){var t=/^"[^]*"(?:\^\^([^"]+)|(@)[^@"]+)?$/.exec(e);if(!t)throw new Error(e+" is not a literal");return t[1]||(t[2]?"http://www.w3.org/1999/02/22-rdf-syntax-ns#langString":r+"string")},getLiteralLanguage:function(e){var t=/^"[^]*"(?:@([^@"]+)|\^\^[^"]+)?$/.exec(e);if(!t)throw new Error(e+" is not a literal");return t[1]?t[1].toLowerCase():""},isPrefixedName:function(e){return e&&/^[^:\/"']*:[^:\/"']+$/.test(e)},expandPrefixedName:function(e,t){var i,r,s,n=/(?:^|"\^\^)([^:\/#"'\^_]*):[^\/]*$/.exec(e);return n&&(i=n[1],r=t[i],s=n.index),void 0===r?e:0===s?r+e.substr(i.length+1):e.substr(0,s+3)+r+e.substr(s+i.length+4)},createIRI:function(e){return e&&'"'===e[0]?s.getLiteralValue(e):e},createLiteral:function(e,t){if(!t)switch(typeof e){case"boolean":t=r+"boolean";break;case"number":if(isFinite(e)){t=e%1==0?r+"integer":r+"decimal";break}default:return'"'+e+'"'}return'"'+e+(/^[a-z]+(-[a-z0-9]+)*$/i.test(t)?'"@'+t.toLowerCase():'"^^'+t)},prefix:function(e){return s.prefixes({"":e})("")},prefixes:function(e){function t(e,t){if(t||!(e in i)){var r=Object.create(null);t=t||"",i[e]=function(e){return r[e]||(r[e]=t+e)}}return i[e]}var i=Object.create(null);for(var r in e)t(r,e[r]);return t}};e.Util=t(t)}(),function(){function t(e){if(!(this instanceof t))return new t(e);if(e=e||{},e.lineMode){this._tripleQuotedString=this._number=this._boolean=/$0^/;var i=this;this._tokenize=this.tokenize,this.tokenize=function(e,t){this._tokenize(e,function(e,r){!e&&/^(?:IRI|prefixed|literal|langcode|type|\.|eof)$/.test(r.type)?t&&t(e,r):t&&t(e||i._syntaxError(r.type,t=null))})}}this._n3Mode=!1!==e.n3,this._comments=!!e.comments}var i=String.fromCharCode,r="function"==typeof setImmediate?setImmediate:function(e){setTimeout(e,0)},s={"\\":"\\","'":"'",'"':'"',n:"\n",r:"\r",t:"\t",f:"\f",b:"\b",_:"_","~":"~",".":".","-":"-","!":"!",$:"$","&":"&","(":"(",")":")","*":"*","+":"+",",":",",";":";","=":"=","/":"/","?":"?","#":"#","@":"@","%":"%"},n=/[\x00-\x20<>\\"\{\}\|\^\`]/;t.prototype={_iri:/^<((?:[^ <>{}\\]|\\[uU])+)>[ \t]*/,_unescapedIri:/^<([^\x00-\x20<>\\"\{\}\|\^\`]*)>[ \t]*/,_unescapedString:/^"[^"\\]+"(?=[^"\\])/,_singleQuotedString:/^"[^"\\]*(?:\\.[^"\\]*)*"(?=[^"\\])|^'[^'\\]*(?:\\.[^'\\]*)*'(?=[^'\\])/,_tripleQuotedString:/^""("[^"\\]*(?:(?:\\.|"(?!""))[^"\\]*)*")""|^''('[^'\\]*(?:(?:\\.|'(?!''))[^'\\]*)*')''/,_langcode:/^@([a-z]+(?:-[a-z0-9]+)*)(?=[^a-z0-9\-])/i,_prefix:/^((?:[A-Za-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(?:\.?[\-0-9A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])*)?:(?=[#\s<])/,_prefixed:/^((?:[A-Za-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(?:\.?[\-0-9A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])*)?:((?:(?:[0-:A-Z_a-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff]|%[0-9a-fA-F]{2}|\\[!#-\/;=?\-@_~])(?:(?:[\.\-0-:A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff]|%[0-9a-fA-F]{2}|\\[!#-\/;=?\-@_~])*(?:[\-0-:A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff]|%[0-9a-fA-F]{2}|\\[!#-\/;=?\-@_~]))?)?)(?:[ \t]+|(?=\.?[,;!\^\s#()\[\]\{\}"'<]))/,_variable:/^\?(?:(?:[A-Z_a-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(?:[\-0-:A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])*)(?=[.,;!\^\s#()\[\]\{\}"'<])/,_blank:/^_:((?:[0-9A-Z_a-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(?:\.?[\-0-9A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])*)(?:[ \t]+|(?=\.?[,;:\s#()\[\]\{\}"'<]))/,_number:/^[\-+]?(?:\d+\.?\d*([eE](?:[\-\+])?\d+)|\d*\.?\d+)(?=[.,;:\s#()\[\]\{\}"'<])/,_boolean:/^(?:true|false)(?=[.,;\s#()\[\]\{\}"'<])/,_keyword:/^@[a-z]+(?=[\s#<])/i,_sparqlKeyword:/^(?:PREFIX|BASE|GRAPH)(?=[\s#<])/i,_shortPredicates:/^a(?=\s+|<)/,_newline:/^[ \t]*(?:#[^\n\r]*)?(?:\r\n|\n|\r)[ \t]*/,_comment:/#([^\n\r]*)/,_whitespace:/^[ \t]+/,_endOfFile:/^(?:#[^\n\r]*)?$/,_tokenizeToEnd:function(e,t){function i(t){e(t._syntaxError(/^\S*/.exec(r)[0]))}for(var r=this._input,s=this._comments;;){for(var a,u;a=this._newline.exec(r);)s&&(u=this._comment.exec(a[0]))&&e(null,{line:this._line,type:"comment",value:u[1],prefix:""}),r=r.substr(a[0].length,r.length),this._line++;if((a=this._whitespace.exec(r))&&(r=r.substr(a[0].length,r.length)),this._endOfFile.test(r))return t&&(s&&(u=this._comment.exec(r))&&e(null,{line:this._line,type:"comment",value:u[1],prefix:""}),e(r=null,{line:this._line,type:"eof",value:"",prefix:""})),this._input=r;var c,h=this._line,f="",d="",_="",o=r[0],l=null,p=0,b=!1;switch(o){case"^":if(r.length<3)break;if("^"!==r[1]){this._n3Mode&&(p=1,f="^");break}if(this._prevTokenType="^^",r=r.substr(2),"<"!==r[0]){b=!0;break}case"<":if(l=this._unescapedIri.exec(r))f="IRI",d=l[1];else if(l=this._iri.exec(r)){if(null===(c=this._unescape(l[1]))||n.test(c))return i(this);f="IRI",d=c}else this._n3Mode&&r.length>1&&"="===r[1]&&(f="inverse",p=2,d="http://www.w3.org/2000/10/swap/log#implies");break;case"_":((l=this._blank.exec(r))||t&&(l=this._blank.exec(r+" ")))&&(f="blank",_="_",d=l[1]);break;case'"':case"'":if(l=this._unescapedString.exec(r))f="literal",d=l[0];else if(l=this._singleQuotedString.exec(r)){if(null===(c=this._unescape(l[0])))return i(this);f="literal",d=c.replace(/^'|'$/g,'"')}else if(l=this._tripleQuotedString.exec(r)){if(c=l[1]||l[2],this._line+=c.split(/\r\n|\r|\n/).length-1,null===(c=this._unescape(c)))return i(this);f="literal",d=c.replace(/^'|'$/g,'"')}break;case"?":this._n3Mode&&(l=this._variable.exec(r))&&(f="var",d=l[0]);break;case"@":"literal"===this._prevTokenType&&(l=this._langcode.exec(r))?(f="langcode",d=l[1]):(l=this._keyword.exec(r))&&(f=l[0]);break;case".":if(1===r.length?t:r[1]<"0"||r[1]>"9"){f=".",p=1;break}case"0":case"1":case"2":case"3":case"4":case"5":case"6":case"7":case"8":case"9":case"+":case"-":(l=this._number.exec(r))&&(f="literal",d='"'+l[0]+'"^^http://www.w3.org/2001/XMLSchema#'+(l[1]?"double":/^[+\-]?\d+$/.test(l[0])?"integer":"decimal"));break;case"B":case"b":case"p":case"P":case"G":case"g":(l=this._sparqlKeyword.exec(r))?f=l[0].toUpperCase():b=!0;break;case"f":case"t":(l=this._boolean.exec(r))?(f="literal",d='"'+l[0]+'"^^http://www.w3.org/2001/XMLSchema#boolean'):b=!0;break;case"a":(l=this._shortPredicates.exec(r))?(f="abbreviation",d="http://www.w3.org/1999/02/22-rdf-syntax-ns#type"):b=!0;break;case"=":this._n3Mode&&r.length>1&&(f="abbreviation",">"!==r[1]?(p=1,d="http://www.w3.org/2002/07/owl#sameAs"):(p=2,d="http://www.w3.org/2000/10/swap/log#implies"));break;case"!":if(!this._n3Mode)break;case",":case";":case"[":case"]":case"(":case")":case"{":case"}":p=1,f=o;break;default:b=!0}if(b&&("@prefix"!==this._prevTokenType&&"PREFIX"!==this._prevTokenType||!(l=this._prefix.exec(r))?((l=this._prefixed.exec(r))||t&&(l=this._prefixed.exec(r+" ")))&&(f="prefixed",_=l[1]||"",d=this._unescape(l[2])):(f="prefix",d=l[1]||"")),"^^"===this._prevTokenType)switch(f){case"prefixed":f="type";break;case"IRI":f="typeIRI";break;default:f=""}if(!f)return t||!/^'''|^"""/.test(r)&&/\n|\r/.test(r)?i(this):this._input=r;e(null,{line:h,type:f,value:d,prefix:_}),this._prevTokenType=f,r=r.substr(p||l[0].length,r.length)}},_unescape:function(e){try{return e.replace(/\\u([a-fA-F0-9]{4})|\\U([a-fA-F0-9]{8})|\\[uU]|\\(.)/g,function(e,t,r,n){var a;if(t){if(a=parseInt(t,16),isNaN(a))throw new Error;return i(a)}if(r){if(a=parseInt(r,16),isNaN(a))throw new Error;return a<=65535?i(a):i(55296+(a-=65536)/1024,56320+(1023&a))}var u=s[n];if(!u)throw new Error;return u})}catch(e){return null}},_syntaxError:function(e){return this._input=null,new Error('Unexpected "'+e+'" on line '+this._line+".")},tokenize:function(e,t){var i=this;if(this._line=1,"string"==typeof e){if(this._input=e,"function"!=typeof t){var s,n=[];if(this._tokenizeToEnd(function(e,t){e?s=e:n.push(t)},!0),s)throw s;return n}r(function(){i._tokenizeToEnd(t,!0)})}else this._input="","function"==typeof e.setEncoding&&e.setEncoding("utf8"),e.on("data",function(e){null!==i._input&&(i._input+=e,i._tokenizeToEnd(t,!1))}),e.on("end",function(){null!==i._input&&i._tokenizeToEnd(t,!0)})}},e.Lexer=t}(),function(){function t(e){if(!(this instanceof t))return new t(e);this._contextStack=[],this._graph=null,e=e||{},this._setBase(e.documentIRI);var s="string"==typeof e.format?e.format.match(/\w*$/)[0].toLowerCase():"",n="turtle"===s,a="trig"===s,u=/triple/.test(s),c=/quad/.test(s),h=this._n3Mode=/n3/.test(s),f=u||c;(this._supportsNamedGraphs=!(n||h))||(this._readPredicateOrNamedGraph=this._readPredicate),this._supportsQuads=!(n||a||u||h),f&&(this._base="",this._resolveIRI=function(e){return this._error("Disallowed relative IRI",e),this._callback=i,this._subject=null}),this._blankNodePrefix="string"!=typeof e.blankNodePrefix?"":"_:"+e.blankNodePrefix.replace(/^_:/,""),this._lexer=e.lexer||new r({lineMode:f,n3:h}),this._explicitQuantifiers=!!e.explicitQuantifiers}function i(){}var r=e.Lexer,s="http://www.w3.org/1999/02/22-rdf-syntax-ns#",n=s+"nil",a=s+"first",u=/^[a-z][a-z0-9+.-]*:/i,c=/(?:^|\/)\.\.?(?:$|[\/#?])/,h=0,f=0;t._resetBlankNodeIds=function(){h=f=0},t.prototype={_setBase:function(e){if(e){var t=e.indexOf("#");t>=0&&(e=e.substr(0,t)),this._base=e,this._basePath=e.indexOf("/")<0?e:e.replace(/[^\/?]*(?:\?.*)?$/,""),e=e.match(/^(?:([a-z][a-z0-9+.-]*:))?(?:\/\/[^\/]*)?/i),this._baseRoot=e[0],this._baseScheme=e[1]}else this._base=null},_saveContext:function(e,t,i,r,s){var n=this._n3Mode;this._contextStack.push({subject:i,predicate:r,object:s,graph:t,type:e,inverse:!!n&&this._inversePredicate,blankPrefix:n?this._prefixes._:"",quantified:n?this._quantified:null}),n&&(this._inversePredicate=!1,this._prefixes._=this._graph+".",this._quantified=Object.create(this._quantified))},_restoreContext:function(){var e=this._contextStack.pop(),t=this._n3Mode;this._subject=e.subject,this._predicate=e.predicate,this._object=e.object,this._graph=e.graph,t&&(this._inversePredicate=e.inverse,this._prefixes._=e.blankPrefix,this._quantified=e.quantified)},_readInTopContext:function(e){switch(e.type){case"eof":return null!==this._graph?this._error("Unclosed graph",e):(delete this._prefixes._,this._callback(null,null,this._prefixes));case"PREFIX":this._sparqlStyle=!0;case"@prefix":return this._readPrefix;case"BASE":this._sparqlStyle=!0;case"@base":return this._readBaseIRI;case"{":if(this._supportsNamedGraphs)return this._graph="",this._subject=null,this._readSubject;case"GRAPH":if(this._supportsNamedGraphs)return this._readNamedGraphLabel;default:return this._readSubject(e)}},_readEntity:function(e,t){var i;switch(e.type){case"IRI":case"typeIRI":i=null===this._base||u.test(e.value)?e.value:this._resolveIRI(e);break;case"type":case"blank":case"prefixed":var r=this._prefixes[e.prefix];if(void 0===r)return this._error('Undefined prefix "'+e.prefix+':"',e);i=r+e.value;break;case"var":return e.value;default:return this._error("Expected entity but got "+e.type,e)}return!t&&this._n3Mode&&i in this._quantified&&(i=this._quantified[i]),i},_readSubject:function(e){switch(this._predicate=null,e.type){case"[":return this._saveContext("blank",this._graph,this._subject="_:b"+f++,null,null),this._readBlankNodeHead;case"(":return this._saveContext("list",this._graph,n,null,null),this._subject=null,this._readListItem;case"{":return this._n3Mode?(this._saveContext("formula",this._graph,this._graph="_:b"+f++,null,null),this._readSubject):this._error("Unexpected graph",e);case"}":return this._readPunctuation(e);case"@forSome":return this._subject=null,this._predicate="http://www.w3.org/2000/10/swap/reify#forSome",this._quantifiedPrefix="_:b",this._readQuantifierList;case"@forAll":return this._subject=null,this._predicate="http://www.w3.org/2000/10/swap/reify#forAll",this._quantifiedPrefix="?b-",this._readQuantifierList;default:if(void 0===(this._subject=this._readEntity(e)))return;if(this._n3Mode)return this._getPathReader(this._readPredicateOrNamedGraph)}return this._readPredicateOrNamedGraph},_readPredicate:function(e){var t=e.type;switch(t){case"inverse":this._inversePredicate=!0;case"abbreviation":this._predicate=e.value;break;case".":case"]":case"}":return null===this._predicate?this._error("Unexpected "+t,e):(this._subject=null,"]"===t?this._readBlankNodeTail(e):this._readPunctuation(e));case";":return this._readPredicate;case"blank":if(!this._n3Mode)return this._error("Disallowed blank node as predicate",e);default:if(void 0===(this._predicate=this._readEntity(e)))return}return this._readObject},_readObject:function(e){switch(e.type){case"literal":return this._object=e.value,this._readDataTypeOrLang;case"[":return this._saveContext("blank",this._graph,this._subject,this._predicate,this._subject="_:b"+f++),this._readBlankNodeHead;case"(":return this._saveContext("list",this._graph,this._subject,this._predicate,n),this._subject=null,this._readListItem;case"{":return this._n3Mode?(this._saveContext("formula",this._graph,this._subject,this._predicate,this._graph="_:b"+f++),this._readSubject):this._error("Unexpected graph",e);default:if(void 0===(this._object=this._readEntity(e)))return;if(this._n3Mode)return this._getPathReader(this._getContextEndReader())}return this._getContextEndReader()},_readPredicateOrNamedGraph:function(e){return"{"===e.type?this._readGraph(e):this._readPredicate(e)},_readGraph:function(e){return"{"!==e.type?this._error("Expected graph but got "+e.type,e):(this._graph=this._subject,this._subject=null,this._readSubject)},_readBlankNodeHead:function(e){return"]"===e.type?(this._subject=null,this._readBlankNodeTail(e)):(this._predicate=null,this._readPredicate(e))},_readBlankNodeTail:function(e){if("]"!==e.type)return this._readBlankNodePunctuation(e);null!==this._subject&&this._triple(this._subject,this._predicate,this._object,this._graph);var t=null===this._predicate;return this._restoreContext(),null===this._object?t?this._readPredicateOrNamedGraph:this._readPredicateAfterBlank:this._getContextEndReader()},_readPredicateAfterBlank:function(e){return"."!==e.type||this._contextStack.length?this._readPredicate(e):(this._subject=null,this._readPunctuation(e))},_readListItem:function(e){var t=null,i=null,r=this._subject,u=this._contextStack,c=u[u.length-1],h=this._readListItem,d=!0;switch(e.type){case"[":this._saveContext("blank",this._graph,i="_:b"+f++,a,this._subject=t="_:b"+f++),h=this._readBlankNodeHead;break;case"(":this._saveContext("list",this._graph,i="_:b"+f++,a,n),this._subject=null;break;case")":if(this._restoreContext(),0!==u.length&&"list"===u[u.length-1].type&&this._triple(this._subject,this._predicate,this._object,this._graph),null===this._predicate){if(h=this._readPredicate,this._subject===n)return h}else if(h=this._getContextEndReader(),this._object===n)return h;i=n;break;case"literal":t=e.value,d=!1,h=this._readListItemDataTypeOrLang;break;default:if(void 0===(t=this._readEntity(e)))return}if(null===i&&(this._subject=i="_:b"+f++),null===r?null===c.predicate?c.subject=i:c.object=i:this._triple(r,s+"rest",i,this._graph),null!==t){if(this._n3Mode&&("IRI"===e.type||"prefixed"===e.type))return this._saveContext("item",this._graph,i,a,t),this._subject=t,this._predicate=null,this._getPathReader(this._readListItem);d?this._triple(i,a,t,this._graph):this._object=t}return h},_readDataTypeOrLang:function(e){return this._completeLiteral(e,!1)},_readListItemDataTypeOrLang:function(e){return this._completeLiteral(e,!0)},_completeLiteral:function(e,t){var i=!1;switch(e.type){case"type":case"typeIRI":i=!0,this._object+="^^"+this._readEntity(e);break;case"langcode":i=!0,this._object+="@"+e.value.toLowerCase()}return t&&this._triple(this._subject,a,this._object,this._graph),i?this._getContextEndReader():(this._readCallback=this._getContextEndReader(),this._readCallback(e))},_readFormulaTail:function(e){return"}"!==e.type?this._readPunctuation(e):(null!==this._subject&&this._triple(this._subject,this._predicate,this._object,this._graph),this._restoreContext(),null===this._object?this._readPredicate:this._getContextEndReader())},_readPunctuation:function(e){var t,i=this._subject,r=this._graph,s=this._inversePredicate;switch(e.type){case"}":if(null===this._graph)return this._error("Unexpected graph closing",e);if(this._n3Mode)return this._readFormulaTail(e);this._graph=null;case".":this._subject=null,t=this._contextStack.length?this._readSubject:this._readInTopContext,s&&(this._inversePredicate=!1);break;case";":t=this._readPredicate;break;case",":t=this._readObject;break;default:if(this._supportsQuads&&null===this._graph&&void 0!==(r=this._readEntity(e))){t=this._readQuadPunctuation;break}return this._error('Expected punctuation to follow "'+this._object+'"',e)}if(null!==i){var n=this._predicate,a=this._object;s?this._triple(a,n,i,r):this._triple(i,n,a,r)}return t},_readBlankNodePunctuation:function(e){var t;switch(e.type){case";":t=this._readPredicate;break;case",":t=this._readObject;break;default:return this._error('Expected punctuation to follow "'+this._object+'"',e)}return this._triple(this._subject,this._predicate,this._object,this._graph),t},_readQuadPunctuation:function(e){return"."!==e.type?this._error("Expected dot to follow quad",e):this._readInTopContext},_readPrefix:function(e){return"prefix"!==e.type?this._error("Expected prefix to follow @prefix",e):(this._prefix=e.value,this._readPrefixIRI)},_readPrefixIRI:function(e){if("IRI"!==e.type)return this._error('Expected IRI to follow prefix "'+this._prefix+':"',e);var t=this._readEntity(e);return this._prefixes[this._prefix]=t,this._prefixCallback(this._prefix,t),this._readDeclarationPunctuation},_readBaseIRI:function(e){return"IRI"!==e.type?this._error("Expected IRI to follow base declaration",e):(this._setBase(null===this._base||u.test(e.value)?e.value:this._resolveIRI(e)),this._readDeclarationPunctuation)},_readNamedGraphLabel:function(e){switch(e.type){case"IRI":case"blank":case"prefixed":return this._readSubject(e),this._readGraph;case"[":return this._readNamedGraphBlankLabel;default:return this._error("Invalid graph label",e)}},_readNamedGraphBlankLabel:function(e){return"]"!==e.type?this._error("Invalid graph label",e):(this._subject="_:b"+f++,this._readGraph)},_readDeclarationPunctuation:function(e){return this._sparqlStyle?(this._sparqlStyle=!1,this._readInTopContext(e)):"."!==e.type?this._error("Expected declaration to end with a dot",e):this._readInTopContext},_readQuantifierList:function(e){var t;switch(e.type){case"IRI":case"prefixed":if(void 0!==(t=this._readEntity(e,!0)))break;default:return this._error("Unexpected "+e.type,e)}return this._explicitQuantifiers?(null===this._subject?this._triple(this._graph||"",this._predicate,this._subject="_:b"+f++,"urn:n3:quantifiers"):this._triple(this._subject,s+"rest",this._subject="_:b"+f++,"urn:n3:quantifiers"),this._triple(this._subject,a,t,"urn:n3:quantifiers")):this._quantified[t]=this._quantifiedPrefix+f++,this._readQuantifierPunctuation},_readQuantifierPunctuation:function(e){return","===e.type?this._readQuantifierList:(this._explicitQuantifiers&&(this._triple(this._subject,s+"rest",n,"urn:n3:quantifiers"),this._subject=null),this._readCallback=this._getContextEndReader(),this._readCallback(e))},_getPathReader:function(e){return this._afterPath=e,this._readPath},_readPath:function(e){switch(e.type){case"!":return this._readForwardPath;case"^":return this._readBackwardPath;default:var t=this._contextStack,i=t.length&&t[t.length-1];if(i&&"item"===i.type){var r=this._subject;this._restoreContext(),this._triple(this._subject,a,r,this._graph)}return this._afterPath(e)}},_readForwardPath:function(e){var t,i,r="_:b"+f++;if(void 0!==(i=this._readEntity(e)))return null===this._predicate?(t=this._subject,this._subject=r):(t=this._object,this._object=r),this._triple(t,i,r,this._graph),this._readPath},_readBackwardPath:function(e){var t,i,r="_:b"+f++;if(void 0!==(t=this._readEntity(e)))return null===this._predicate?(i=this._subject,this._subject=r):(i=this._object,this._object=r),this._triple(r,t,i,this._graph),this._readPath},_getContextEndReader:function(){var e=this._contextStack;if(!e.length)return this._readPunctuation;switch(e[e.length-1].type){case"blank":return this._readBlankNodeTail;case"list":return this._readListItem;case"formula":return this._readFormulaTail}},_triple:function(e,t,i,r){this._callback(null,{subject:e,predicate:t,object:i,graph:r||""})},_error:function(e,t){this._callback(new Error(e+" on line "+t.line+"."))},_resolveIRI:function(e){var t=e.value;switch(t[0]){case void 0:return this._base;case"#":return this._base+t;case"?":return this._base.replace(/(?:\?.*)?$/,t);case"/":return("/"===t[1]?this._baseScheme:this._baseRoot)+this._removeDotSegments(t);default:return this._removeDotSegments(this._basePath+t)}},_removeDotSegments:function(e){if(!c.test(e))return e;for(var t="",i=e.length,r=-1,s=-1,n=0,a="/";r<i;){switch(a){case":":if(s<0&&"/"===e[++r]&&"/"===e[++r])for(;(s=r+1)<i&&"/"!==e[s];)r=s;break;case"?":case"#":r=i;break;case"/":if("."===e[r+1])switch(a=e[++r+1]){case"/":t+=e.substring(n,r-1),n=r+1;break;case void 0:case"?":case"#":return t+e.substring(n,r)+e.substr(r+1);case".":if(void 0===(a=e[++r+1])||"/"===a||"?"===a||"#"===a){if(t+=e.substring(n,r-2),(n=t.lastIndexOf("/"))>=s&&(t=t.substr(0,n)),"/"!==a)return t+"/"+e.substr(r+1);n=r+1}}}a=e[++r]}return t+e.substring(n)},parse:function(e,t,r){var s=this;if(this._readCallback=this._readInTopContext,this._sparqlStyle=!1,this._prefixes=Object.create(null),this._prefixes._=this._blankNodePrefix||"_:b"+h+++"_",this._prefixCallback=r||i,this._inversePredicate=!1,this._quantified=Object.create(null),!t){var n,a=[];if(this._callback=function(e,t){e?n=e:t&&a.push(t)},this._lexer.tokenize(e).every(function(e){return s._readCallback=s._readCallback(e)}),n)throw n;return a}this._callback=t,this._lexer.tokenize(e,function(e,t){null!==e?(s._callback(e),s._callback=i):s._readCallback&&(s._readCallback=s._readCallback(t))})}},e.Parser=t}(),function(){function t(e,i){if(!(this instanceof t))return new t(e,i);if(e&&"function"!=typeof e.write&&(i=e,e=null),i=i||{},e)this._outputStream=e,this._endStream=void 0===i.end||!!i.end;else{var r="";this._outputStream={write:function(e,t,i){r+=e,i&&i()},end:function(e){e&&e(null,r)}},this._endStream=!0}this._subject=null,/triple|quad/i.test(i.format)?this._writeTriple=this._writeTripleLine:(this._graph="",this._prefixIRIs=Object.create(null),i.prefixes&&this.addPrefixes(i.prefixes))}function i(e){var t=a[e];return void 0===t&&(1===e.length?(t=e.charCodeAt(0).toString(16),t="\\u0000".substr(0,6-t.length)+t):(t=(1024*(e.charCodeAt(0)-55296)+e.charCodeAt(1)+9216).toString(16),t="\\U00000000".substr(0,10-t.length)+t)),t}var r=/^"([^]*)"(?:\^\^(.+)|@([\-a-z]+))?$/i,s=/["\\\t\n\r\b\f\u0000-\u0019\ud800-\udbff]/,n=/["\\\t\n\r\b\f\u0000-\u0019]|[\ud800-\udbff][\udc00-\udfff]/g,a={"\\":"\\\\",'"':'\\"',"\t":"\\t","\n":"\\n","\r":"\\r","\b":"\\b","\f":"\\f"};t.prototype={_write:function(e,t){this._outputStream.write(e,"utf8",t)},_writeTriple:function(e,t,i,r,s){try{this._graph!==r&&(this._write((null===this._subject?"":this._graph?"\n}\n":".\n")+(r?this._encodeIriOrBlankNode(r)+" {\n":"")),this._subject=null,this._graph="["!==r[0]?r:"]"),this._subject===e?this._predicate===t?this._write(", "+this._encodeObject(i),s):this._write(";\n    "+this._encodePredicate(this._predicate=t)+" "+this._encodeObject(i),s):this._write((null===this._subject?"":".\n")+this._encodeSubject(this._subject=e)+" "+this._encodePredicate(this._predicate=t)+" "+this._encodeObject(i),s)}catch(e){s&&s(e)}},_writeTripleLine:function(e,t,i,r,s){delete this._prefixMatch;try{this._write(this._encodeIriOrBlankNode(e)+" "+this._encodeIriOrBlankNode(t)+" "+this._encodeObject(i)+(r?" "+this._encodeIriOrBlankNode(r)+".\n":".\n"),s)}catch(e){s&&s(e)}},_encodeIriOrBlankNode:function(e){var t=e[0];if("["===t||"("===t||"_"===t&&":"===e[1])return e;s.test(e)&&(e=e.replace(n,i));var r=this._prefixRegex.exec(e);return r?r[1]?this._prefixIRIs[r[1]]+r[2]:e:"<"+e+">"},_encodeLiteral:function(e,t,r){return s.test(e)&&(e=e.replace(n,i)),r?'"'+e+'"@'+r:t?'"'+e+'"^^'+this._encodeIriOrBlankNode(t):'"'+e+'"'},_encodeSubject:function(e){if('"'===e[0])throw new Error("A literal as subject is not allowed: "+e);return"["===e[0]&&(this._subject="]"),this._encodeIriOrBlankNode(e)},_encodePredicate:function(e){if('"'===e[0])throw new Error("A literal as predicate is not allowed: "+e);return"http://www.w3.org/1999/02/22-rdf-syntax-ns#type"===e?"a":this._encodeIriOrBlankNode(e)},_encodeObject:function(e){if('"'!==e[0])return this._encodeIriOrBlankNode(e);var t=r.exec(e);if(!t)throw new Error("Invalid literal: "+e);return this._encodeLiteral(t[1],t[2],t[3])},_blockedWrite:function(){throw new Error("Cannot write because the writer has been closed.")},addTriple:function(e,t,i,r,s){void 0===i?this._writeTriple(e.subject,e.predicate,e.object,e.graph||"",t):"string"!=typeof r?this._writeTriple(e,t,i,"",r):this._writeTriple(e,t,i,r,s)},addTriples:function(e){for(var t=0;t<e.length;t++)this.addTriple(e[t])},addPrefix:function(e,t,i){var r={};r[e]=t,this.addPrefixes(r,i)},addPrefixes:function(e,t){var i=this._prefixIRIs,r=!1;for(var s in e){var n=e[s];/[#\/]$/.test(n)&&i[n]!==(s+=":")&&(r=!0,i[n]=s,null!==this._subject&&(this._write(this._graph?"\n}\n":".\n"),this._subject=null,this._graph=""),this._write("@prefix "+s+" <"+n+">.\n"))}if(r){var a="",u="";for(var c in i)a+=a?"|"+c:c,u+=(u?"|":"")+i[c];a=a.replace(/[\]\/\(\)\*\+\?\.\\\$]/g,"\\$&"),this._prefixRegex=new RegExp("^(?:"+u+")[^/]*$|^("+a+")([a-zA-Z][\\-_a-zA-Z0-9]*)$")}this._write(r?"\n":"",t)},blank:function(e,t){var i,r,s=e;switch(void 0===e?s=[]:"string"==typeof e?s=[{predicate:e,object:t}]:"length"in e||(s=[e]),r=s.length){case 0:return"[]";case 1:if(i=s[0],"["!==i.object[0])return"[ "+this._encodePredicate(i.predicate)+" "+this._encodeObject(i.object)+" ]";default:for(var n="[",a=0;a<r;a++)i=s[a],i.predicate===e?n+=", "+this._encodeObject(i.object):(n+=(a?";\n  ":"\n  ")+this._encodePredicate(i.predicate)+" "+this._encodeObject(i.object),e=i.predicate);return n+"\n]"}},list:function(e){for(var t=e&&e.length||0,i=new Array(t),r=0;r<t;r++)i[r]=this._encodeObject(e[r]);return"("+i.join(" ")+")"},_prefixRegex:/$0^/,end:function(e){null!==this._subject&&(this._write(this._graph?"\n}\n":".\n"),this._subject=null),this._write=this._blockedWrite;var t=e&&function(i,r){t=null,e(i,r)};if(this._endStream)try{return this._outputStream.end(t)}catch(e){}t&&t()}},e.Writer=t}(),function(){function t(e,i){if(!(this instanceof t))return new t(e,i);this._size=0,this._graphs=Object.create(null),this._id=0,this._ids=Object.create(null),this._ids["><"]=0,this._entities=Object.create(null),this._blankNodeIndex=0,i||!e||e[0]||(i=e,e=null),i=i||{},this._prefixes=Object.create(null),i.prefixes&&this.addPrefixes(i.prefixes),e&&this.addTriples(e)}function i(e){return"string"==typeof e||e instanceof String}var r=e.Util.expandPrefixedName;t.prototype={get size(){var e=this._size;if(null!==e)return e;var t,i,r=this._graphs;for(var s in r)for(var n in t=r[s].subjects)for(var a in i=t[n])e+=Object.keys(i[a]).length;return this._size=e},_addToIndex:function(e,t,i,r){var s=e[t]||(e[t]={}),n=s[i]||(s[i]={}),a=r in n;return a||(n[r]=null),!a},_removeFromIndex:function(e,t,i,r){var s,n=e[t],a=n[i];delete a[r];for(s in a)return;delete n[i];for(s in n)return;delete e[t]},_findInIndex:function(e,t,i,r,s,n,a,u){var c,h,f,d=[],_=!t+!i+!r,o=_>1?Object.keys(this._ids):this._entities;t&&((c=e,e={})[t]=c[t]);for(var l in e){var p=o[l];if(h=e[l]){i&&((c=h,h={})[i]=c[i]);for(var b in h){var x=o[b];if(f=h[b])for(var g=(r?r in f?[r]:[]:Object.keys(f)),v=g.length-1;v>=0;v--){var j={subject:"",predicate:"",object:"",graph:u};j[s]=p,j[n]=x,j[a]=o[g[v]],d.push(j)}}}}return d},_countInIndex:function(e,t,i,r){var s,n,a,u=0;t&&((s=e,e={})[t]=s[t]);for(var c in e)if(n=e[c]){i&&((s=n,n={})[i]=s[i]);for(var h in n)(a=n[h])&&(r?r in a&&u++:u+=Object.keys(a).length)}return u},addTriple:function(e,t,i,r){t||(r=e.graph,i=e.object,t=e.predicate,e=e.subject),r=r||"";var s=this._graphs[r];s||(s=this._graphs[r]={subjects:{},predicates:{},objects:{}},Object.freeze(s));var n=this._ids,a=this._entities;e=n[e]||(n[a[++this._id]=e]=this._id),t=n[t]||(n[a[++this._id]=t]=this._id),i=n[i]||(n[a[++this._id]=i]=this._id);var u=this._addToIndex(s.subjects,e,t,i);return this._addToIndex(s.predicates,t,i,e),this._addToIndex(s.objects,i,e,t),this._size=null,u},addTriples:function(e){for(var t=e.length-1;t>=0;t--)this.addTriple(e[t])},addPrefix:function(e,t){this._prefixes[e]=t},addPrefixes:function(e){for(var t in e)this.addPrefix(t,e[t])},removeTriple:function(e,t,i,r){t||(r=e.graph,i=e.object,t=e.predicate,e=e.subject),r=r||"";var s,n=this._ids,a=this._graphs;if(!(e=n[e]))return!1;if(!(t=n[t]))return!1;if(!(i=n[i]))return!1;if(!(s=a[r]))return!1;var u,c;if(!(u=s.subjects[e]))return!1;if(!(c=u[t]))return!1;if(!(i in c))return!1;this._removeFromIndex(s.subjects,e,t,i),this._removeFromIndex(s.predicates,t,i,e),this._removeFromIndex(s.objects,i,e,t),null!==this._size&&this._size--;for(e in s.subjects)return!0;return delete a[r],!0},removeTriples:function(e){for(var t=e.length-1;t>=0;t--)this.removeTriple(e[t])},find:function(e,t,i,s){var n=this._prefixes;return this.findByIRI(r(e,n),r(t,n),r(i,n),r(s,n))},findByIRI:function(e,t,r,s){var n,a,u,c,h=[],f={},d=this._ids;if(i(s)?f[s]=this._graphs[s]:f=this._graphs,i(e)&&!(a=d[e]))return h;if(i(t)&&!(u=d[t]))return h;if(i(r)&&!(c=d[r]))return h;for(var _ in f)(n=f[_])&&(a?c?h.push(this._findInIndex(n.objects,c,a,u,"object","subject","predicate",_)):h.push(this._findInIndex(n.subjects,a,u,null,"subject","predicate","object",_)):u?h.push(this._findInIndex(n.predicates,u,c,null,"predicate","object","subject",_)):c?h.push(this._findInIndex(n.objects,c,null,null,"object","subject","predicate",_)):h.push(this._findInIndex(n.subjects,null,null,null,"subject","predicate","object",_)));return 1===h.length?h[0]:h.concat.apply([],h)},count:function(e,t,i,s){var n=this._prefixes;return this.countByIRI(r(e,n),r(t,n),r(i,n),r(s,n))},countByIRI:function(e,t,r,s){var n,a,u,c,h=0,f={},d=this._ids;if(i(s)?f[s]=this._graphs[s]:f=this._graphs,i(e)&&!(a=d[e]))return 0;if(i(t)&&!(u=d[t]))return 0;if(i(r)&&!(c=d[r]))return 0
;for(var _ in f)(n=f[_])&&(h+=e?r?this._countInIndex(n.objects,c,a,u):this._countInIndex(n.subjects,a,u,c):t?this._countInIndex(n.predicates,u,c,a):this._countInIndex(n.objects,c,a,u));return h},createBlankNode:function(e){var t,i;if(e)for(t=e="_:"+e,i=1;this._ids[t];)t=e+i++;else do{t="_:b"+this._blankNodeIndex++}while(this._ids[t]);return this._ids[t]=++this._id,this._entities[this._id]=t,t}},e.Store=t}()}("undefined"!=typeof exports?exports:this.N3={});});

define("ace/mode/turtle_worker",["require","exports","module","ace/lib/oop","ace/worker/mirror","ace/ext/rdflib","ace/ext/fsm","ace/ext/n3-browser.min.js"], function(require, exports, module) {
    "use strict";

    var oop = require("../lib/oop");
    var Mirror = require("../worker/mirror").Mirror;
    var $rdf = require('ace/ext/rdflib');
    var StateMachine = require('ace/ext/fsm');
    var N3 = require('ace/ext/n3-browser.min.js');
    var idstatements = [];

    var TurtleWorker = exports.TurtleWorker = function(sender) {
        Mirror.call(this, sender);
        this.setTimeout(500);
        this.setOptions();
    };

    oop.inherits(TurtleWorker, Mirror);

    (function() {

        this.setOptions = function(options) {
            this.options = options || {
                esnext: true,
                moz: true,
                devel: true,
                browser: true,
                node: true,
                laxcomma: true,
                laxbreak: true,
                lastsemic: true,
                onevar: false,
                passfail: false,
                maxerr: 100,
                expr: true,
                multistr: true,
                globalstrict: true
            };
            this.doc.getValue() && this.deferredUpdate.schedule(100);
        };

        this.changeOptions = function(newOptions) {
            oop.mixin(this.options, newOptions);
            this.doc.getValue() && this.deferredUpdate.schedule(100);
        };

        this.isValidJS = function(str) {
            try {
                eval("throw 0;" + str);
            } catch (e) {
                if (e === 0)
                    return true;
            }
            return false
        };

        var curLine = 1;
        this.onUpdate = function() {
            var text = this.doc.getValue();
            text.replace(/^#!.*\n/, "\n").match(/[^\r\n]+/g);
            var errors = [];
            if (true) {

                var uri = 'http://www.engie.com';
                var mimeType = 'text/turtle';
                var store = $rdf.graph();

                try {
                    $rdf.parse(text, store, uri, mimeType);
                    store.statements.forEach(function(statement) {
                        errors.push({
                            row: 1,
                            column: 0,
                            text: 'Parsed successfully:\n' + statement.subject + ' ' + statement.predicate + ' ' + statement.object,
                            type: "info",
                            raw: " is not valid"
                        });
                    });

                } catch (err) {
                    var linenumber = err.split('\n')[1].split(' ')[1] - 1;
                    errors.push({
                        row: linenumber,
                        column: 0,
                        text: err.split('\n')[1].split('>:')[1],
                        type: "error",
                        raw: " errorHere"
                    });
                    errors.push({
                        row: 0,
                        column: 0,
                        text: err.split('\n')[1].split('>:')[1],
                        type: "warning",
                        raw: " errorHere"
                    });
                    console.log(err);
                }
            };

            this.sender.emit("annotate", errors);
        }
    }).call(TurtleWorker.prototype);
});

define("ace/lib/es5-shim",["require","exports","module"], function(require, exports, module) {

function Empty() {}

if (!Function.prototype.bind) {
    Function.prototype.bind = function bind(that) { // .length is 1
        var target = this;
        if (typeof target != "function") {
            throw new TypeError("Function.prototype.bind called on incompatible " + target);
        }
        var args = slice.call(arguments, 1); // for normal call
        var bound = function () {

            if (this instanceof bound) {

                var result = target.apply(
                    this,
                    args.concat(slice.call(arguments))
                );
                if (Object(result) === result) {
                    return result;
                }
                return this;

            } else {
                return target.apply(
                    that,
                    args.concat(slice.call(arguments))
                );

            }

        };
        if(target.prototype) {
            Empty.prototype = target.prototype;
            bound.prototype = new Empty();
            Empty.prototype = null;
        }
        return bound;
    };
}
var call = Function.prototype.call;
var prototypeOfArray = Array.prototype;
var prototypeOfObject = Object.prototype;
var slice = prototypeOfArray.slice;
var _toString = call.bind(prototypeOfObject.toString);
var owns = call.bind(prototypeOfObject.hasOwnProperty);
var defineGetter;
var defineSetter;
var lookupGetter;
var lookupSetter;
var supportsAccessors;
if ((supportsAccessors = owns(prototypeOfObject, "__defineGetter__"))) {
    defineGetter = call.bind(prototypeOfObject.__defineGetter__);
    defineSetter = call.bind(prototypeOfObject.__defineSetter__);
    lookupGetter = call.bind(prototypeOfObject.__lookupGetter__);
    lookupSetter = call.bind(prototypeOfObject.__lookupSetter__);
}
if ([1,2].splice(0).length != 2) {
    if(function() { // test IE < 9 to splice bug - see issue #138
        function makeArray(l) {
            var a = new Array(l+2);
            a[0] = a[1] = 0;
            return a;
        }
        var array = [], lengthBefore;
        
        array.splice.apply(array, makeArray(20));
        array.splice.apply(array, makeArray(26));

        lengthBefore = array.length; //46
        array.splice(5, 0, "XXX"); // add one element

        lengthBefore + 1 == array.length

        if (lengthBefore + 1 == array.length) {
            return true;// has right splice implementation without bugs
        }
    }()) {//IE 6/7
        var array_splice = Array.prototype.splice;
        Array.prototype.splice = function(start, deleteCount) {
            if (!arguments.length) {
                return [];
            } else {
                return array_splice.apply(this, [
                    start === void 0 ? 0 : start,
                    deleteCount === void 0 ? (this.length - start) : deleteCount
                ].concat(slice.call(arguments, 2)))
            }
        };
    } else {//IE8
        Array.prototype.splice = function(pos, removeCount){
            var length = this.length;
            if (pos > 0) {
                if (pos > length)
                    pos = length;
            } else if (pos == void 0) {
                pos = 0;
            } else if (pos < 0) {
                pos = Math.max(length + pos, 0);
            }

            if (!(pos+removeCount < length))
                removeCount = length - pos;

            var removed = this.slice(pos, pos+removeCount);
            var insert = slice.call(arguments, 2);
            var add = insert.length;            
            if (pos === length) {
                if (add) {
                    this.push.apply(this, insert);
                }
            } else {
                var remove = Math.min(removeCount, length - pos);
                var tailOldPos = pos + remove;
                var tailNewPos = tailOldPos + add - remove;
                var tailCount = length - tailOldPos;
                var lengthAfterRemove = length - remove;

                if (tailNewPos < tailOldPos) { // case A
                    for (var i = 0; i < tailCount; ++i) {
                        this[tailNewPos+i] = this[tailOldPos+i];
                    }
                } else if (tailNewPos > tailOldPos) { // case B
                    for (i = tailCount; i--; ) {
                        this[tailNewPos+i] = this[tailOldPos+i];
                    }
                } // else, add == remove (nothing to do)

                if (add && pos === lengthAfterRemove) {
                    this.length = lengthAfterRemove; // truncate array
                    this.push.apply(this, insert);
                } else {
                    this.length = lengthAfterRemove + add; // reserves space
                    for (i = 0; i < add; ++i) {
                        this[pos+i] = insert[i];
                    }
                }
            }
            return removed;
        };
    }
}
if (!Array.isArray) {
    Array.isArray = function isArray(obj) {
        return _toString(obj) == "[object Array]";
    };
}
var boxedString = Object("a"),
    splitString = boxedString[0] != "a" || !(0 in boxedString);

if (!Array.prototype.forEach) {
    Array.prototype.forEach = function forEach(fun /*, thisp*/) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            thisp = arguments[1],
            i = -1,
            length = self.length >>> 0;
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(); // TODO message
        }

        while (++i < length) {
            if (i in self) {
                fun.call(thisp, self[i], i, object);
            }
        }
    };
}
if (!Array.prototype.map) {
    Array.prototype.map = function map(fun /*, thisp*/) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0,
            result = Array(length),
            thisp = arguments[1];
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        for (var i = 0; i < length; i++) {
            if (i in self)
                result[i] = fun.call(thisp, self[i], i, object);
        }
        return result;
    };
}
if (!Array.prototype.filter) {
    Array.prototype.filter = function filter(fun /*, thisp */) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                    object,
            length = self.length >>> 0,
            result = [],
            value,
            thisp = arguments[1];
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        for (var i = 0; i < length; i++) {
            if (i in self) {
                value = self[i];
                if (fun.call(thisp, value, i, object)) {
                    result.push(value);
                }
            }
        }
        return result;
    };
}
if (!Array.prototype.every) {
    Array.prototype.every = function every(fun /*, thisp */) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0,
            thisp = arguments[1];
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        for (var i = 0; i < length; i++) {
            if (i in self && !fun.call(thisp, self[i], i, object)) {
                return false;
            }
        }
        return true;
    };
}
if (!Array.prototype.some) {
    Array.prototype.some = function some(fun /*, thisp */) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0,
            thisp = arguments[1];
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        for (var i = 0; i < length; i++) {
            if (i in self && fun.call(thisp, self[i], i, object)) {
                return true;
            }
        }
        return false;
    };
}
if (!Array.prototype.reduce) {
    Array.prototype.reduce = function reduce(fun /*, initial*/) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0;
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }
        if (!length && arguments.length == 1) {
            throw new TypeError("reduce of empty array with no initial value");
        }

        var i = 0;
        var result;
        if (arguments.length >= 2) {
            result = arguments[1];
        } else {
            do {
                if (i in self) {
                    result = self[i++];
                    break;
                }
                if (++i >= length) {
                    throw new TypeError("reduce of empty array with no initial value");
                }
            } while (true);
        }

        for (; i < length; i++) {
            if (i in self) {
                result = fun.call(void 0, result, self[i], i, object);
            }
        }

        return result;
    };
}
if (!Array.prototype.reduceRight) {
    Array.prototype.reduceRight = function reduceRight(fun /*, initial*/) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0;
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }
        if (!length && arguments.length == 1) {
            throw new TypeError("reduceRight of empty array with no initial value");
        }

        var result, i = length - 1;
        if (arguments.length >= 2) {
            result = arguments[1];
        } else {
            do {
                if (i in self) {
                    result = self[i--];
                    break;
                }
                if (--i < 0) {
                    throw new TypeError("reduceRight of empty array with no initial value");
                }
            } while (true);
        }

        do {
            if (i in this) {
                result = fun.call(void 0, result, self[i], i, object);
            }
        } while (i--);

        return result;
    };
}
if (!Array.prototype.indexOf || ([0, 1].indexOf(1, 2) != -1)) {
    Array.prototype.indexOf = function indexOf(sought /*, fromIndex */ ) {
        var self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                toObject(this),
            length = self.length >>> 0;

        if (!length) {
            return -1;
        }

        var i = 0;
        if (arguments.length > 1) {
            i = toInteger(arguments[1]);
        }
        i = i >= 0 ? i : Math.max(0, length + i);
        for (; i < length; i++) {
            if (i in self && self[i] === sought) {
                return i;
            }
        }
        return -1;
    };
}
if (!Array.prototype.lastIndexOf || ([0, 1].lastIndexOf(0, -3) != -1)) {
    Array.prototype.lastIndexOf = function lastIndexOf(sought /*, fromIndex */) {
        var self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                toObject(this),
            length = self.length >>> 0;

        if (!length) {
            return -1;
        }
        var i = length - 1;
        if (arguments.length > 1) {
            i = Math.min(i, toInteger(arguments[1]));
        }
        i = i >= 0 ? i : length - Math.abs(i);
        for (; i >= 0; i--) {
            if (i in self && sought === self[i]) {
                return i;
            }
        }
        return -1;
    };
}
if (!Object.getPrototypeOf) {
    Object.getPrototypeOf = function getPrototypeOf(object) {
        return object.__proto__ || (
            object.constructor ?
            object.constructor.prototype :
            prototypeOfObject
        );
    };
}
if (!Object.getOwnPropertyDescriptor) {
    var ERR_NON_OBJECT = "Object.getOwnPropertyDescriptor called on a " +
                         "non-object: ";
    Object.getOwnPropertyDescriptor = function getOwnPropertyDescriptor(object, property) {
        if ((typeof object != "object" && typeof object != "function") || object === null)
            throw new TypeError(ERR_NON_OBJECT + object);
        if (!owns(object, property))
            return;

        var descriptor, getter, setter;
        descriptor =  { enumerable: true, configurable: true };
        if (supportsAccessors) {
            var prototype = object.__proto__;
            object.__proto__ = prototypeOfObject;

            var getter = lookupGetter(object, property);
            var setter = lookupSetter(object, property);
            object.__proto__ = prototype;

            if (getter || setter) {
                if (getter) descriptor.get = getter;
                if (setter) descriptor.set = setter;
                return descriptor;
            }
        }
        descriptor.value = object[property];
        return descriptor;
    };
}
if (!Object.getOwnPropertyNames) {
    Object.getOwnPropertyNames = function getOwnPropertyNames(object) {
        return Object.keys(object);
    };
}
if (!Object.create) {
    var createEmpty;
    if (Object.prototype.__proto__ === null) {
        createEmpty = function () {
            return { "__proto__": null };
        };
    } else {
        createEmpty = function () {
            var empty = {};
            for (var i in empty)
                empty[i] = null;
            empty.constructor =
            empty.hasOwnProperty =
            empty.propertyIsEnumerable =
            empty.isPrototypeOf =
            empty.toLocaleString =
            empty.toString =
            empty.valueOf =
            empty.__proto__ = null;
            return empty;
        }
    }

    Object.create = function create(prototype, properties) {
        var object;
        if (prototype === null) {
            object = createEmpty();
        } else {
            if (typeof prototype != "object")
                throw new TypeError("typeof prototype["+(typeof prototype)+"] != 'object'");
            var Type = function () {};
            Type.prototype = prototype;
            object = new Type();
            object.__proto__ = prototype;
        }
        if (properties !== void 0)
            Object.defineProperties(object, properties);
        return object;
    };
}

function doesDefinePropertyWork(object) {
    try {
        Object.defineProperty(object, "sentinel", {});
        return "sentinel" in object;
    } catch (exception) {
    }
}
if (Object.defineProperty) {
    var definePropertyWorksOnObject = doesDefinePropertyWork({});
    var definePropertyWorksOnDom = typeof document == "undefined" ||
        doesDefinePropertyWork(document.createElement("div"));
    if (!definePropertyWorksOnObject || !definePropertyWorksOnDom) {
        var definePropertyFallback = Object.defineProperty;
    }
}

if (!Object.defineProperty || definePropertyFallback) {
    var ERR_NON_OBJECT_DESCRIPTOR = "Property description must be an object: ";
    var ERR_NON_OBJECT_TARGET = "Object.defineProperty called on non-object: "
    var ERR_ACCESSORS_NOT_SUPPORTED = "getters & setters can not be defined " +
                                      "on this javascript engine";

    Object.defineProperty = function defineProperty(object, property, descriptor) {
        if ((typeof object != "object" && typeof object != "function") || object === null)
            throw new TypeError(ERR_NON_OBJECT_TARGET + object);
        if ((typeof descriptor != "object" && typeof descriptor != "function") || descriptor === null)
            throw new TypeError(ERR_NON_OBJECT_DESCRIPTOR + descriptor);
        if (definePropertyFallback) {
            try {
                return definePropertyFallback.call(Object, object, property, descriptor);
            } catch (exception) {
            }
        }
        if (owns(descriptor, "value")) {

            if (supportsAccessors && (lookupGetter(object, property) ||
                                      lookupSetter(object, property)))
            {
                var prototype = object.__proto__;
                object.__proto__ = prototypeOfObject;
                delete object[property];
                object[property] = descriptor.value;
                object.__proto__ = prototype;
            } else {
                object[property] = descriptor.value;
            }
        } else {
            if (!supportsAccessors)
                throw new TypeError(ERR_ACCESSORS_NOT_SUPPORTED);
            if (owns(descriptor, "get"))
                defineGetter(object, property, descriptor.get);
            if (owns(descriptor, "set"))
                defineSetter(object, property, descriptor.set);
        }

        return object;
    };
}
if (!Object.defineProperties) {
    Object.defineProperties = function defineProperties(object, properties) {
        for (var property in properties) {
            if (owns(properties, property))
                Object.defineProperty(object, property, properties[property]);
        }
        return object;
    };
}
if (!Object.seal) {
    Object.seal = function seal(object) {
        return object;
    };
}
if (!Object.freeze) {
    Object.freeze = function freeze(object) {
        return object;
    };
}
try {
    Object.freeze(function () {});
} catch (exception) {
    Object.freeze = (function freeze(freezeObject) {
        return function freeze(object) {
            if (typeof object == "function") {
                return object;
            } else {
                return freezeObject(object);
            }
        };
    })(Object.freeze);
}
if (!Object.preventExtensions) {
    Object.preventExtensions = function preventExtensions(object) {
        return object;
    };
}
if (!Object.isSealed) {
    Object.isSealed = function isSealed(object) {
        return false;
    };
}
if (!Object.isFrozen) {
    Object.isFrozen = function isFrozen(object) {
        return false;
    };
}
if (!Object.isExtensible) {
    Object.isExtensible = function isExtensible(object) {
        if (Object(object) === object) {
            throw new TypeError(); // TODO message
        }
        var name = '';
        while (owns(object, name)) {
            name += '?';
        }
        object[name] = true;
        var returnValue = owns(object, name);
        delete object[name];
        return returnValue;
    };
}
if (!Object.keys) {
    var hasDontEnumBug = true,
        dontEnums = [
            "toString",
            "toLocaleString",
            "valueOf",
            "hasOwnProperty",
            "isPrototypeOf",
            "propertyIsEnumerable",
            "constructor"
        ],
        dontEnumsLength = dontEnums.length;

    for (var key in {"toString": null}) {
        hasDontEnumBug = false;
    }

    Object.keys = function keys(object) {

        if (
            (typeof object != "object" && typeof object != "function") ||
            object === null
        ) {
            throw new TypeError("Object.keys called on a non-object");
        }

        var keys = [];
        for (var name in object) {
            if (owns(object, name)) {
                keys.push(name);
            }
        }

        if (hasDontEnumBug) {
            for (var i = 0, ii = dontEnumsLength; i < ii; i++) {
                var dontEnum = dontEnums[i];
                if (owns(object, dontEnum)) {
                    keys.push(dontEnum);
                }
            }
        }
        return keys;
    };

}
if (!Date.now) {
    Date.now = function now() {
        return new Date().getTime();
    };
}
var ws = "\x09\x0A\x0B\x0C\x0D\x20\xA0\u1680\u180E\u2000\u2001\u2002\u2003" +
    "\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\u2028" +
    "\u2029\uFEFF";
if (!String.prototype.trim || ws.trim()) {
    ws = "[" + ws + "]";
    var trimBeginRegexp = new RegExp("^" + ws + ws + "*"),
        trimEndRegexp = new RegExp(ws + ws + "*$");
    String.prototype.trim = function trim() {
        return String(this).replace(trimBeginRegexp, "").replace(trimEndRegexp, "");
    };
}

function toInteger(n) {
    n = +n;
    if (n !== n) { // isNaN
        n = 0;
    } else if (n !== 0 && n !== (1/0) && n !== -(1/0)) {
        n = (n > 0 || -1) * Math.floor(Math.abs(n));
    }
    return n;
}

function isPrimitive(input) {
    var type = typeof input;
    return (
        input === null ||
        type === "undefined" ||
        type === "boolean" ||
        type === "number" ||
        type === "string"
    );
}

function toPrimitive(input) {
    var val, valueOf, toString;
    if (isPrimitive(input)) {
        return input;
    }
    valueOf = input.valueOf;
    if (typeof valueOf === "function") {
        val = valueOf.call(input);
        if (isPrimitive(val)) {
            return val;
        }
    }
    toString = input.toString;
    if (typeof toString === "function") {
        val = toString.call(input);
        if (isPrimitive(val)) {
            return val;
        }
    }
    throw new TypeError();
}
var toObject = function (o) {
    if (o == null) { // this matches both null and undefined
        throw new TypeError("can't convert "+o+" to object");
    }
    return Object(o);
};

});
