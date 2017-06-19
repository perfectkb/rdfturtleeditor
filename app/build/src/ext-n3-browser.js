define("ace/ext/n3-browser",["require","exports","module"], function(require, exports, module) {
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
(function (N3) {
(function () {

var Xsd = 'http://www.w3.org/2001/XMLSchema#';
var XsdString  = Xsd + 'string';
var XsdInteger = Xsd + 'integer';
var XsdDecimal = Xsd + 'decimal';
var XsdBoolean = Xsd + 'boolean';
var RdfLangString = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString';

var N3Util = {
  isIRI: function (entity) {
    if (!entity)
      return entity;
    var firstChar = entity[0];
    return firstChar !== '"' && firstChar !== '_';
  },
  isLiteral: function (entity) {
    return entity && entity[0] === '"';
  },
  isBlank: function (entity) {
    return entity && entity.substr(0, 2) === '_:';
  },
  isDefaultGraph: function (entity) {
    return !entity;
  },
  inDefaultGraph: function (triple) {
    return !triple.graph;
  },
  getLiteralValue: function (literal) {
    var match = /^"([^]*)"/.exec(literal);
    if (!match)
      throw new Error(literal + ' is not a literal');
    return match[1];
  },
  getLiteralType: function (literal) {
    var match = /^"[^]*"(?:\^\^([^"]+)|(@)[^@"]+)?$/.exec(literal);
    if (!match)
      throw new Error(literal + ' is not a literal');
    return match[1] || (match[2] ? RdfLangString : XsdString);
  },
  getLiteralLanguage: function (literal) {
    var match = /^"[^]*"(?:@([^@"]+)|\^\^[^"]+)?$/.exec(literal);
    if (!match)
      throw new Error(literal + ' is not a literal');
    return match[1] ? match[1].toLowerCase() : '';
  },
  isPrefixedName: function (entity) {
    return entity && /^[^:\/"']*:[^:\/"']+$/.test(entity);
  },
  expandPrefixedName: function (prefixedName, prefixes) {
    var match = /(?:^|"\^\^)([^:\/#"'\^_]*):[^\/]*$/.exec(prefixedName), prefix, base, index;
    if (match)
      prefix = match[1], base = prefixes[prefix], index = match.index;
    if (base === undefined)
      return prefixedName;
    return index === 0 ? base + prefixedName.substr(prefix.length + 1)
                       : prefixedName.substr(0, index + 3) +
                         base + prefixedName.substr(index + prefix.length + 4);
  },
  createIRI: function (iri) {
    return iri && iri[0] === '"' ? N3Util.getLiteralValue(iri) : iri;
  },
  createLiteral: function (value, modifier) {
    if (!modifier) {
      switch (typeof value) {
      case 'boolean':
        modifier = XsdBoolean;
        break;
      case 'number':
        if (isFinite(value)) {
          modifier = value % 1 === 0 ? XsdInteger : XsdDecimal;
          break;
        }
      default:
        return '"' + value + '"';
      }
    }
    return '"' + value +
           (/^[a-z]+(-[a-z0-9]+)*$/i.test(modifier) ? '"@'  + modifier.toLowerCase()
                                                    : '"^^' + modifier);
  },
  prefix: function (iri) {
    return N3Util.prefixes({ '': iri })('');
  },
  prefixes: function (defaultPrefixes) {
    var prefixes = Object.create(null);
    for (var prefix in defaultPrefixes)
      processPrefix(prefix, defaultPrefixes[prefix]);
    function processPrefix(prefix, iri) {
      if (iri || !(prefix in prefixes)) {
        var cache = Object.create(null);
        iri = iri || '';
        prefixes[prefix] = function (localName) {
          return cache[localName] || (cache[localName] = iri + localName);
        };
      }
      return prefixes[prefix];
    }
    return processPrefix;
  },
};
function addN3Util(parent, toPrototype) {
  for (var name in N3Util)
    if (!toPrototype)
      parent[name] = N3Util[name];
    else
      parent.prototype[name] = applyToThis(N3Util[name]);

  return parent;
}
function applyToThis(f) {
  return function (a) { return f(this, a); };
}

N3.Util = addN3Util(addN3Util);

})();
(function () {
var fromCharCode = String.fromCharCode;
var immediately = typeof setImmediate === 'function' ? setImmediate :
                  function setImmediate(func) { setTimeout(func, 0); };
var escapeSequence = /\\u([a-fA-F0-9]{4})|\\U([a-fA-F0-9]{8})|\\[uU]|\\(.)/g;
var escapeReplacements = {
  '\\': '\\', "'": "'", '"': '"',
  'n': '\n', 'r': '\r', 't': '\t', 'f': '\f', 'b': '\b',
  '_': '_', '~': '~', '.': '.', '-': '-', '!': '!', '$': '$', '&': '&',
  '(': '(', ')': ')', '*': '*', '+': '+', ',': ',', ';': ';', '=': '=',
  '/': '/', '?': '?', '#': '#', '@': '@', '%': '%',
};
var illegalIriChars = /[\x00-\x20<>\\"\{\}\|\^\`]/;
function N3Lexer(options) {
  if (!(this instanceof N3Lexer))
    return new N3Lexer(options);
  options = options || {};
  if (options.lineMode) {
    this._tripleQuotedString = this._number = this._boolean = /$0^/;
    var self = this;
    this._tokenize = this.tokenize;
    this.tokenize = function (input, callback) {
      this._tokenize(input, function (error, token) {
        if (!error && /^(?:IRI|prefixed|literal|langcode|type|\.|eof)$/.test(token.type))
          callback && callback(error, token);
        else
          callback && callback(error || self._syntaxError(token.type, callback = null));
      });
    };
  }
  this._n3Mode = options.n3 !== false;
  this._comments = !!options.comments;
}

N3Lexer.prototype = {

  _iri: /^<((?:[^ <>{}\\]|\\[uU])+)>[ \t]*/, // IRI with escape sequences; needs sanity check after unescaping
  _unescapedIri: /^<([^\x00-\x20<>\\"\{\}\|\^\`]*)>[ \t]*/, // IRI without escape sequences; no unescaping
  _unescapedString: /^"[^"\\]+"(?=[^"\\])/, // non-empty string without escape sequences
  _singleQuotedString: /^"[^"\\]*(?:\\.[^"\\]*)*"(?=[^"\\])|^'[^'\\]*(?:\\.[^'\\]*)*'(?=[^'\\])/,
  _tripleQuotedString: /^""("[^"\\]*(?:(?:\\.|"(?!""))[^"\\]*)*")""|^''('[^'\\]*(?:(?:\\.|'(?!''))[^'\\]*)*')''/,
  _langcode: /^@([a-z]+(?:-[a-z0-9]+)*)(?=[^a-z0-9\-])/i,
  _prefix: /^((?:[A-Za-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(?:\.?[\-0-9A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])*)?:(?=[#\s<])/,
  _prefixed: /^((?:[A-Za-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(?:\.?[\-0-9A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])*)?:((?:(?:[0-:A-Z_a-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff]|%[0-9a-fA-F]{2}|\\[!#-\/;=?\-@_~])(?:(?:[\.\-0-:A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff]|%[0-9a-fA-F]{2}|\\[!#-\/;=?\-@_~])*(?:[\-0-:A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff]|%[0-9a-fA-F]{2}|\\[!#-\/;=?\-@_~]))?)?)(?:[ \t]+|(?=\.?[,;!\^\s#()\[\]\{\}"'<]))/,
  _variable: /^\?(?:(?:[A-Z_a-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(?:[\-0-:A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])*)(?=[.,;!\^\s#()\[\]\{\}"'<])/,
  _blank: /^_:((?:[0-9A-Z_a-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(?:\.?[\-0-9A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])*)(?:[ \t]+|(?=\.?[,;:\s#()\[\]\{\}"'<]))/,
  _number: /^[\-+]?(?:\d+\.?\d*([eE](?:[\-\+])?\d+)|\d*\.?\d+)(?=[.,;:\s#()\[\]\{\}"'<])/,
  _boolean: /^(?:true|false)(?=[.,;\s#()\[\]\{\}"'<])/,
  _keyword: /^@[a-z]+(?=[\s#<])/i,
  _sparqlKeyword: /^(?:PREFIX|BASE|GRAPH)(?=[\s#<])/i,
  _shortPredicates: /^a(?=\s+|<)/,
  _newline: /^[ \t]*(?:#[^\n\r]*)?(?:\r\n|\n|\r)[ \t]*/,
  _comment: /#([^\n\r]*)/,
  _whitespace: /^[ \t]+/,
  _endOfFile: /^(?:#[^\n\r]*)?$/,
  _tokenizeToEnd: function (callback, inputFinished) {
    var input = this._input, outputComments = this._comments;
    while (true) {
      var whiteSpaceMatch, comment;
      while (whiteSpaceMatch = this._newline.exec(input)) {
        if (outputComments && (comment = this._comment.exec(whiteSpaceMatch[0])))
          callback(null, { line: this._line, type: 'comment', value: comment[1], prefix: '' });
        input = input.substr(whiteSpaceMatch[0].length, input.length);
        this._line++;
      }
      if (whiteSpaceMatch = this._whitespace.exec(input))
        input = input.substr(whiteSpaceMatch[0].length, input.length);
      if (this._endOfFile.test(input)) {
        if (inputFinished) {
          if (outputComments && (comment = this._comment.exec(input)))
            callback(null, { line: this._line, type: 'comment', value: comment[1], prefix: '' });
          callback(input = null, { line: this._line, type: 'eof', value: '', prefix: '' });
        }
        return this._input = input;
      }
      var line = this._line, type = '', value = '', prefix = '',
          firstChar = input[0], match = null, matchLength = 0, unescaped, inconclusive = false;
      switch (firstChar) {
      case '^':
        if (input.length < 3)
          break;
        else if (input[1] === '^') {
          this._prevTokenType = '^^';
          input = input.substr(2);
          if (input[0] !== '<') {
            inconclusive = true;
            break;
          }
        }
        else {
          if (this._n3Mode) {
            matchLength = 1;
            type = '^';
          }
          break;
        }
      case '<':
        if (match = this._unescapedIri.exec(input))
          type = 'IRI', value = match[1];
        else if (match = this._iri.exec(input)) {
          unescaped = this._unescape(match[1]);
          if (unescaped === null || illegalIriChars.test(unescaped))
            return reportSyntaxError(this);
          type = 'IRI', value = unescaped;
        }
        else if (this._n3Mode && input.length > 1 && input[1] === '=')
          type = 'inverse', matchLength = 2, value = 'http://www.w3.org/2000/10/swap/log#implies';
        break;

      case '_':
        if ((match = this._blank.exec(input)) ||
            inputFinished && (match = this._blank.exec(input + ' ')))
          type = 'blank', prefix = '_', value = match[1];
        break;

      case '"':
      case "'":
        if (match = this._unescapedString.exec(input))
          type = 'literal', value = match[0];
        else if (match = this._singleQuotedString.exec(input)) {
          unescaped = this._unescape(match[0]);
          if (unescaped === null)
            return reportSyntaxError(this);
          type = 'literal', value = unescaped.replace(/^'|'$/g, '"');
        }
        else if (match = this._tripleQuotedString.exec(input)) {
          unescaped = match[1] || match[2];
          this._line += unescaped.split(/\r\n|\r|\n/).length - 1;
          unescaped = this._unescape(unescaped);
          if (unescaped === null)
            return reportSyntaxError(this);
          type = 'literal', value = unescaped.replace(/^'|'$/g, '"');
        }
        break;

      case '?':
        if (this._n3Mode && (match = this._variable.exec(input)))
          type = 'var', value = match[0];
        break;

      case '@':
        if (this._prevTokenType === 'literal' && (match = this._langcode.exec(input)))
          type = 'langcode', value = match[1];
        else if (match = this._keyword.exec(input))
          type = match[0];
        break;

      case '.':
        if (input.length === 1 ? inputFinished : (input[1] < '0' || input[1] > '9')) {
          type = '.';
          matchLength = 1;
          break;
        }

      case '0':
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
      case '+':
      case '-':
        if (match = this._number.exec(input)) {
          type = 'literal';
          value = '"' + match[0] + '"^^http://www.w3.org/2001/XMLSchema#' +
                  (match[1] ? 'double' : (/^[+\-]?\d+$/.test(match[0]) ? 'integer' : 'decimal'));
        }
        break;

      case 'B':
      case 'b':
      case 'p':
      case 'P':
      case 'G':
      case 'g':
        if (match = this._sparqlKeyword.exec(input))
          type = match[0].toUpperCase();
        else
          inconclusive = true;
        break;

      case 'f':
      case 't':
        if (match = this._boolean.exec(input))
          type = 'literal', value = '"' + match[0] + '"^^http://www.w3.org/2001/XMLSchema#boolean';
        else
          inconclusive = true;
        break;

      case 'a':
        if (match = this._shortPredicates.exec(input))
          type = 'abbreviation', value = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
        else
          inconclusive = true;
        break;

      case '=':
        if (this._n3Mode && input.length > 1) {
          type = 'abbreviation';
          if (input[1] !== '>')
            matchLength = 1, value = 'http://www.w3.org/2002/07/owl#sameAs';
          else
            matchLength = 2, value = 'http://www.w3.org/2000/10/swap/log#implies';
        }
        break;

      case '!':
        if (!this._n3Mode)
          break;
      case ',':
      case ';':
      case '[':
      case ']':
      case '(':
      case ')':
      case '{':
      case '}':
        matchLength = 1;
        type = firstChar;
        break;

      default:
        inconclusive = true;
      }
      if (inconclusive) {
        if ((this._prevTokenType === '@prefix' || this._prevTokenType === 'PREFIX') &&
            (match = this._prefix.exec(input)))
          type = 'prefix', value = match[1] || '';
        else if ((match = this._prefixed.exec(input)) ||
                 inputFinished && (match = this._prefixed.exec(input + ' ')))
          type = 'prefixed', prefix = match[1] || '', value = this._unescape(match[2]);
      }
      if (this._prevTokenType === '^^') {
        switch (type) {
        case 'prefixed': type = 'type';    break;
        case 'IRI':      type = 'typeIRI'; break;
        default:         type = '';
        }
      }
      if (!type) {
        if (inputFinished || (!/^'''|^"""/.test(input) && /\n|\r/.test(input)))
          return reportSyntaxError(this);
        else
          return this._input = input;
      }
      callback(null, { line: line, type: type, value: value, prefix: prefix });
      this._prevTokenType = type;
      input = input.substr(matchLength || match[0].length, input.length);
    }
    function reportSyntaxError(self) { callback(self._syntaxError(/^\S*/.exec(input)[0])); }
  },
  _unescape: function (item) {
    try {
      return item.replace(escapeSequence, function (sequence, unicode4, unicode8, escapedChar) {
        var charCode;
        if (unicode4) {
          charCode = parseInt(unicode4, 16);
          if (isNaN(charCode)) throw new Error(); // can never happen (regex), but helps performance
          return fromCharCode(charCode);
        }
        else if (unicode8) {
          charCode = parseInt(unicode8, 16);
          if (isNaN(charCode)) throw new Error(); // can never happen (regex), but helps performance
          if (charCode <= 0xFFFF) return fromCharCode(charCode);
          return fromCharCode(0xD800 + ((charCode -= 0x10000) / 0x400), 0xDC00 + (charCode & 0x3FF));
        }
        else {
          var replacement = escapeReplacements[escapedChar];
          if (!replacement)
            throw new Error();
          return replacement;
        }
      });
    }
    catch (error) { return null; }
  },
  _syntaxError: function (issue) {
    this._input = null;
    return new Error('Unexpected "' + issue + '" on line ' + this._line + '.');
  },
  tokenize: function (input, callback) {
    var self = this;
    this._line = 1;
    if (typeof input === 'string') {
      this._input = input;
      if (typeof callback === 'function')
        immediately(function () { self._tokenizeToEnd(callback, true); });
      else {
        var tokens = [], error;
        this._tokenizeToEnd(function (e, t) { e ? (error = e) : tokens.push(t); }, true);
        if (error) throw error;
        return tokens;
      }
    }
    else {
      this._input = '';
      if (typeof input.setEncoding === 'function')
        input.setEncoding('utf8');
      input.on('data', function (data) {
        if (self._input !== null) {
          self._input += data;
          self._tokenizeToEnd(callback, false);
        }
      });
      input.on('end', function () {
        if (self._input !== null)
          self._tokenizeToEnd(callback, true);
      });
    }
  },
};

N3.Lexer = N3Lexer;

})();
(function () {
var N3Lexer = N3.Lexer;

var RDF_PREFIX = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    RDF_NIL    = RDF_PREFIX + 'nil',
    RDF_FIRST  = RDF_PREFIX + 'first',
    RDF_REST   = RDF_PREFIX + 'rest';

var QUANTIFIERS_GRAPH = 'urn:n3:quantifiers';

var absoluteIRI = /^[a-z][a-z0-9+.-]*:/i,
    schemeAuthority = /^(?:([a-z][a-z0-9+.-]*:))?(?:\/\/[^\/]*)?/i,
    dotSegments = /(?:^|\/)\.\.?(?:$|[\/#?])/;
var blankNodePrefix = 0, blankNodeCount = 0;
function N3Parser(options) {
  if (!(this instanceof N3Parser))
    return new N3Parser(options);
  this._contextStack = [];
  this._graph = null;
  options = options || {};
  this._setBase(options.documentIRI);
  var format = (typeof options.format === 'string') ?
               options.format.match(/\w*$/)[0].toLowerCase() : '',
      isTurtle = format === 'turtle', isTriG = format === 'trig',
      isNTriples = /triple/.test(format), isNQuads = /quad/.test(format),
      isN3 = this._n3Mode = /n3/.test(format),
      isLineMode = isNTriples || isNQuads;
  if (!(this._supportsNamedGraphs = !(isTurtle || isN3)))
    this._readPredicateOrNamedGraph = this._readPredicate;
  this._supportsQuads = !(isTurtle || isTriG || isNTriples || isN3);
  if (isLineMode) {
    this._base = '';
    this._resolveIRI = function (token) {
      this._error('Disallowed relative IRI', token);
      return this._callback = noop, this._subject = null;
    };
  }
  this._blankNodePrefix = typeof options.blankNodePrefix !== 'string' ? '' :
                            '_:' + options.blankNodePrefix.replace(/^_:/, '');
  this._lexer = options.lexer || new N3Lexer({ lineMode: isLineMode, n3: isN3 });
  this._explicitQuantifiers = !!options.explicitQuantifiers;
}
N3Parser._resetBlankNodeIds = function () {
  blankNodePrefix = blankNodeCount = 0;
};

N3Parser.prototype = {
  _setBase: function (baseIRI) {
    if (!baseIRI)
      this._base = null;
    else {
      var fragmentPos = baseIRI.indexOf('#');
      if (fragmentPos >= 0)
        baseIRI = baseIRI.substr(0, fragmentPos);
      this._base = baseIRI;
      this._basePath   = baseIRI.indexOf('/') < 0 ? baseIRI :
                         baseIRI.replace(/[^\/?]*(?:\?.*)?$/, '');
      baseIRI = baseIRI.match(schemeAuthority);
      this._baseRoot   = baseIRI[0];
      this._baseScheme = baseIRI[1];
    }
  },
  _saveContext: function (type, graph, subject, predicate, object) {
    var n3Mode = this._n3Mode;
    this._contextStack.push({
      subject: subject, predicate: predicate, object: object,
      graph: graph, type: type,
      inverse: n3Mode ? this._inversePredicate : false,
      blankPrefix: n3Mode ? this._prefixes._ : '',
      quantified: n3Mode ? this._quantified : null,
    });
    if (n3Mode) {
      this._inversePredicate = false;
      this._prefixes._ = this._graph + '.';
      this._quantified = Object.create(this._quantified);
    }
  },
  _restoreContext: function () {
    var context = this._contextStack.pop(), n3Mode = this._n3Mode;
    this._subject   = context.subject;
    this._predicate = context.predicate;
    this._object    = context.object;
    this._graph     = context.graph;
    if (n3Mode) {
      this._inversePredicate = context.inverse;
      this._prefixes._ = context.blankPrefix;
      this._quantified = context.quantified;
    }
  },
  _readInTopContext: function (token) {
    switch (token.type) {
    case 'eof':
      if (this._graph !== null)
        return this._error('Unclosed graph', token);
      delete this._prefixes._;
      return this._callback(null, null, this._prefixes);
    case 'PREFIX':
      this._sparqlStyle = true;
    case '@prefix':
      return this._readPrefix;
    case 'BASE':
      this._sparqlStyle = true;
    case '@base':
      return this._readBaseIRI;
    case '{':
      if (this._supportsNamedGraphs) {
        this._graph = '';
        this._subject = null;
        return this._readSubject;
      }
    case 'GRAPH':
      if (this._supportsNamedGraphs)
        return this._readNamedGraphLabel;
    default:
      return this._readSubject(token);
    }
  },
  _readEntity: function (token, quantifier) {
    var value;
    switch (token.type) {
    case 'IRI':
    case 'typeIRI':
      value = (this._base === null || absoluteIRI.test(token.value)) ?
              token.value : this._resolveIRI(token);
      break;
    case 'type':
    case 'blank':
    case 'prefixed':
      var prefix = this._prefixes[token.prefix];
      if (prefix === undefined)
        return this._error('Undefined prefix "' + token.prefix + ':"', token);
      value = prefix + token.value;
      break;
    case 'var':
      return token.value;
    default:
      return this._error('Expected entity but got ' + token.type, token);
    }
    if (!quantifier && this._n3Mode && (value in this._quantified))
      value = this._quantified[value];
    return value;
  },
  _readSubject: function (token) {
    this._predicate = null;
    switch (token.type) {
    case '[':
      this._saveContext('blank', this._graph,
                        this._subject = '_:b' + blankNodeCount++, null, null);
      return this._readBlankNodeHead;
    case '(':
      this._saveContext('list', this._graph, RDF_NIL, null, null);
      this._subject = null;
      return this._readListItem;
    case '{':
      if (!this._n3Mode)
        return this._error('Unexpected graph', token);
      this._saveContext('formula', this._graph,
                        this._graph = '_:b' + blankNodeCount++, null, null);
      return this._readSubject;
    case '}':
      return this._readPunctuation(token);
    case '@forSome':
      this._subject = null;
      this._predicate = 'http://www.w3.org/2000/10/swap/reify#forSome';
      this._quantifiedPrefix = '_:b';
      return this._readQuantifierList;
    case '@forAll':
      this._subject = null;
      this._predicate = 'http://www.w3.org/2000/10/swap/reify#forAll';
      this._quantifiedPrefix = '?b-';
      return this._readQuantifierList;
    default:
      if ((this._subject = this._readEntity(token)) === undefined)
        return;
      if (this._n3Mode)
        return this._getPathReader(this._readPredicateOrNamedGraph);
    }
    return this._readPredicateOrNamedGraph;
  },
  _readPredicate: function (token) {
    var type = token.type;
    switch (type) {
    case 'inverse':
      this._inversePredicate = true;
    case 'abbreviation':
      this._predicate = token.value;
      break;
    case '.':
    case ']':
    case '}':
      if (this._predicate === null)
        return this._error('Unexpected ' + type, token);
      this._subject = null;
      return type === ']' ? this._readBlankNodeTail(token) : this._readPunctuation(token);
    case ';':
      return this._readPredicate;
    case 'blank':
      if (!this._n3Mode)
        return this._error('Disallowed blank node as predicate', token);
    default:
      if ((this._predicate = this._readEntity(token)) === undefined)
        return;
    }
    return this._readObject;
  },
  _readObject: function (token) {
    switch (token.type) {
    case 'literal':
      this._object = token.value;
      return this._readDataTypeOrLang;
    case '[':
      this._saveContext('blank', this._graph, this._subject, this._predicate,
                        this._subject = '_:b' + blankNodeCount++);
      return this._readBlankNodeHead;
    case '(':
      this._saveContext('list', this._graph, this._subject, this._predicate, RDF_NIL);
      this._subject = null;
      return this._readListItem;
    case '{':
      if (!this._n3Mode)
        return this._error('Unexpected graph', token);
      this._saveContext('formula', this._graph, this._subject, this._predicate,
                        this._graph = '_:b' + blankNodeCount++);
      return this._readSubject;
    default:
      if ((this._object = this._readEntity(token)) === undefined)
        return;
      if (this._n3Mode)
        return this._getPathReader(this._getContextEndReader());
    }
    return this._getContextEndReader();
  },
  _readPredicateOrNamedGraph: function (token) {
    return token.type === '{' ? this._readGraph(token) : this._readPredicate(token);
  },
  _readGraph: function (token) {
    if (token.type !== '{')
      return this._error('Expected graph but got ' + token.type, token);
    this._graph = this._subject, this._subject = null;
    return this._readSubject;
  },
  _readBlankNodeHead: function (token) {
    if (token.type === ']') {
      this._subject = null;
      return this._readBlankNodeTail(token);
    }
    else {
      this._predicate = null;
      return this._readPredicate(token);
    }
  },
  _readBlankNodeTail: function (token) {
    if (token.type !== ']')
      return this._readBlankNodePunctuation(token);
    if (this._subject !== null)
      this._triple(this._subject, this._predicate, this._object, this._graph);
    var empty = this._predicate === null;
    this._restoreContext();
    if (this._object === null)
      return empty ? this._readPredicateOrNamedGraph : this._readPredicateAfterBlank;
    else
      return this._getContextEndReader();
  },
  _readPredicateAfterBlank: function (token) {
    if (token.type === '.' && !this._contextStack.length) {
      this._subject = null; // cancel the current triple
      return this._readPunctuation(token);
    }
    return this._readPredicate(token);
  },
  _readListItem: function (token) {
    var item = null,                      // The item of the list
        list = null,                      // The list itself
        prevList = this._subject,         // The previous list that contains this list
        stack = this._contextStack,       // The stack of parent contexts
        parent = stack[stack.length - 1], // The parent containing the current list
        next = this._readListItem,        // The next function to execute
        itemComplete = true;              // Whether the item has been read fully

    switch (token.type) {
    case '[':
      this._saveContext('blank', this._graph, list = '_:b' + blankNodeCount++,
                        RDF_FIRST, this._subject = item = '_:b' + blankNodeCount++);
      next = this._readBlankNodeHead;
      break;
    case '(':
      this._saveContext('list', this._graph, list = '_:b' + blankNodeCount++,
                        RDF_FIRST, RDF_NIL);
      this._subject = null;
      break;
    case ')':
      this._restoreContext();
      if (stack.length !== 0 && stack[stack.length - 1].type === 'list')
        this._triple(this._subject, this._predicate, this._object, this._graph);
      if (this._predicate === null) {
        next = this._readPredicate;
        if (this._subject === RDF_NIL)
          return next;
      }
      else {
        next = this._getContextEndReader();
        if (this._object === RDF_NIL)
          return next;
      }
      list = RDF_NIL;
      break;
    case 'literal':
      item = token.value;
      itemComplete = false; // Can still have a datatype or language
      next = this._readListItemDataTypeOrLang;
      break;
    default:
      if ((item = this._readEntity(token)) === undefined)
        return;
    }
    if (list === null)
      this._subject = list = '_:b' + blankNodeCount++;
    if (prevList === null) {
      if (parent.predicate === null)
        parent.subject = list;
      else
        parent.object = list;
    }
    else {
      this._triple(prevList, RDF_REST, list, this._graph);
    }
    if (item !== null) {
      if (this._n3Mode && (token.type === 'IRI' || token.type === 'prefixed')) {
        this._saveContext('item', this._graph, list, RDF_FIRST, item);
        this._subject = item, this._predicate = null;
        return this._getPathReader(this._readListItem);
      }
      if (itemComplete)
        this._triple(list, RDF_FIRST, item, this._graph);
      else
        this._object = item;
    }
    return next;
  },
  _readDataTypeOrLang: function (token) {
    return this._completeLiteral(token, false);
  },
  _readListItemDataTypeOrLang: function (token) {
    return this._completeLiteral(token, true);
  },
  _completeLiteral: function (token, listItem) {
    var suffix = false;
    switch (token.type) {
    case 'type':
    case 'typeIRI':
      suffix = true;
      this._object += '^^' + this._readEntity(token);
      break;
    case 'langcode':
      suffix = true;
      this._object += '@' + token.value.toLowerCase();
      break;
    }
    if (listItem)
      this._triple(this._subject, RDF_FIRST, this._object, this._graph);
    if (suffix)
      return this._getContextEndReader();
    else {
      this._readCallback = this._getContextEndReader();
      return this._readCallback(token);
    }
  },
  _readFormulaTail: function (token) {
    if (token.type !== '}')
      return this._readPunctuation(token);
    if (this._subject !== null)
      this._triple(this._subject, this._predicate, this._object, this._graph);
    this._restoreContext();
    return this._object === null ? this._readPredicate : this._getContextEndReader();
  },
  _readPunctuation: function (token) {
    var next, subject = this._subject, graph = this._graph,
        inversePredicate = this._inversePredicate;
    switch (token.type) {
    case '}':
      if (this._graph === null)
        return this._error('Unexpected graph closing', token);
      if (this._n3Mode)
        return this._readFormulaTail(token);
      this._graph = null;
    case '.':
      this._subject = null;
      next = this._contextStack.length ? this._readSubject : this._readInTopContext;
      if (inversePredicate) this._inversePredicate = false;
      break;
    case ';':
      next = this._readPredicate;
      break;
    case ',':
      next = this._readObject;
      break;
    default:
      if (this._supportsQuads && this._graph === null && (graph = this._readEntity(token)) !== undefined) {
        next = this._readQuadPunctuation;
        break;
      }
      return this._error('Expected punctuation to follow "' + this._object + '"', token);
    }
    if (subject !== null) {
      var predicate = this._predicate, object = this._object;
      if (!inversePredicate)
        this._triple(subject, predicate, object,  graph);
      else
        this._triple(object,  predicate, subject, graph);
    }
    return next;
  },
  _readBlankNodePunctuation: function (token) {
    var next;
    switch (token.type) {
    case ';':
      next = this._readPredicate;
      break;
    case ',':
      next = this._readObject;
      break;
    default:
      return this._error('Expected punctuation to follow "' + this._object + '"', token);
    }
    this._triple(this._subject, this._predicate, this._object, this._graph);
    return next;
  },
  _readQuadPunctuation: function (token) {
    if (token.type !== '.')
      return this._error('Expected dot to follow quad', token);
    return this._readInTopContext;
  },
  _readPrefix: function (token) {
    if (token.type !== 'prefix')
      return this._error('Expected prefix to follow @prefix', token);
    this._prefix = token.value;
    return this._readPrefixIRI;
  },
  _readPrefixIRI: function (token) {
    if (token.type !== 'IRI')
      return this._error('Expected IRI to follow prefix "' + this._prefix + ':"', token);
    var prefixIRI = this._readEntity(token);
    this._prefixes[this._prefix] = prefixIRI;
    this._prefixCallback(this._prefix, prefixIRI);
    return this._readDeclarationPunctuation;
  },
  _readBaseIRI: function (token) {
    if (token.type !== 'IRI')
      return this._error('Expected IRI to follow base declaration', token);
    this._setBase(this._base === null || absoluteIRI.test(token.value) ?
                  token.value : this._resolveIRI(token));
    return this._readDeclarationPunctuation;
  },
  _readNamedGraphLabel: function (token) {
    switch (token.type) {
    case 'IRI':
    case 'blank':
    case 'prefixed':
      return this._readSubject(token), this._readGraph;
    case '[':
      return this._readNamedGraphBlankLabel;
    default:
      return this._error('Invalid graph label', token);
    }
  },
  _readNamedGraphBlankLabel: function (token) {
    if (token.type !== ']')
      return this._error('Invalid graph label', token);
    this._subject = '_:b' + blankNodeCount++;
    return this._readGraph;
  },
  _readDeclarationPunctuation: function (token) {
    if (this._sparqlStyle) {
      this._sparqlStyle = false;
      return this._readInTopContext(token);
    }

    if (token.type !== '.')
      return this._error('Expected declaration to end with a dot', token);
    return this._readInTopContext;
  },
  _readQuantifierList: function (token) {
    var entity;
    switch (token.type) {
    case 'IRI':
    case 'prefixed':
      if ((entity = this._readEntity(token, true)) !== undefined)
        break;
    default:
      return this._error('Unexpected ' + token.type, token);
    }
    if (!this._explicitQuantifiers)
      this._quantified[entity] = this._quantifiedPrefix + blankNodeCount++;
    else {
      if (this._subject === null)
        this._triple(this._graph || '', this._predicate,
                     this._subject = '_:b' + blankNodeCount++, QUANTIFIERS_GRAPH);
      else
        this._triple(this._subject, RDF_REST,
                     this._subject = '_:b' + blankNodeCount++, QUANTIFIERS_GRAPH);
      this._triple(this._subject, RDF_FIRST, entity, QUANTIFIERS_GRAPH);
    }
    return this._readQuantifierPunctuation;
  },
  _readQuantifierPunctuation: function (token) {
    if (token.type === ',')
      return this._readQuantifierList;
    else {
      if (this._explicitQuantifiers) {
        this._triple(this._subject, RDF_REST, RDF_NIL, QUANTIFIERS_GRAPH);
        this._subject = null;
      }
      this._readCallback = this._getContextEndReader();
      return this._readCallback(token);
    }
  },
  _getPathReader: function (afterPath) {
    this._afterPath = afterPath;
    return this._readPath;
  },
  _readPath: function (token) {
    switch (token.type) {
    case '!': return this._readForwardPath;
    case '^': return this._readBackwardPath;
    default:
      var stack = this._contextStack, parent = stack.length && stack[stack.length - 1];
      if (parent && parent.type === 'item') {
        var item = this._subject;
        this._restoreContext();
        this._triple(this._subject, RDF_FIRST, item, this._graph);
      }
      return this._afterPath(token);
    }
  },
  _readForwardPath: function (token) {
    var subject, predicate, object = '_:b' + blankNodeCount++;
    if ((predicate = this._readEntity(token)) === undefined)
      return;
    if (this._predicate === null)
      subject = this._subject, this._subject = object;
    else
      subject = this._object,  this._object  = object;
    this._triple(subject, predicate, object, this._graph);
    return this._readPath;
  },
  _readBackwardPath: function (token) {
    var subject = '_:b' + blankNodeCount++, predicate, object;
    if ((predicate = this._readEntity(token)) === undefined)
      return;
    if (this._predicate === null)
      object = this._subject, this._subject = subject;
    else
      object = this._object,  this._object  = subject;
    this._triple(subject, predicate, object, this._graph);
    return this._readPath;
  },
  _getContextEndReader: function () {
    var contextStack = this._contextStack;
    if (!contextStack.length)
      return this._readPunctuation;

    switch (contextStack[contextStack.length - 1].type) {
    case 'blank':
      return this._readBlankNodeTail;
    case 'list':
      return this._readListItem;
    case 'formula':
      return this._readFormulaTail;
    }
  },
  _triple: function (subject, predicate, object, graph) {
    this._callback(null,
      { subject: subject, predicate: predicate, object: object, graph: graph || '' });
  },
  _error: function (message, token) {
    this._callback(new Error(message + ' on line ' + token.line + '.'));
  },
  _resolveIRI: function (token) {
    var iri = token.value;
    switch (iri[0]) {
    case undefined: return this._base;
    case '#': return this._base + iri;
    case '?': return this._base.replace(/(?:\?.*)?$/, iri);
    case '/':
      return (iri[1] === '/' ? this._baseScheme : this._baseRoot) + this._removeDotSegments(iri);
    default:
      return this._removeDotSegments(this._basePath + iri);
    }
  },
  _removeDotSegments: function (iri) {
    if (!dotSegments.test(iri))
      return iri;
    var result = '', length = iri.length, i = -1, pathStart = -1, segmentStart = 0, next = '/';

    while (i < length) {
      switch (next) {
      case ':':
        if (pathStart < 0) {
          if (iri[++i] === '/' && iri[++i] === '/')
            while ((pathStart = i + 1) < length && iri[pathStart] !== '/')
              i = pathStart;
        }
        break;
      case '?':
      case '#':
        i = length;
        break;
      case '/':
        if (iri[i + 1] === '.') {
          next = iri[++i + 1];
          switch (next) {
          case '/':
            result += iri.substring(segmentStart, i - 1);
            segmentStart = i + 1;
            break;
          case undefined:
          case '?':
          case '#':
            return result + iri.substring(segmentStart, i) + iri.substr(i + 1);
          case '.':
            next = iri[++i + 1];
            if (next === undefined || next === '/' || next === '?' || next === '#') {
              result += iri.substring(segmentStart, i - 2);
              if ((segmentStart = result.lastIndexOf('/')) >= pathStart)
                result = result.substr(0, segmentStart);
              if (next !== '/')
                return result + '/' + iri.substr(i + 1);
              segmentStart = i + 1;
            }
          }
        }
      }
      next = iri[++i];
    }
    return result + iri.substring(segmentStart);
  },
  parse: function (input, tripleCallback, prefixCallback) {
    var self = this;
    this._readCallback = this._readInTopContext;
    this._sparqlStyle = false;
    this._prefixes = Object.create(null);
    this._prefixes._ = this._blankNodePrefix || '_:b' + blankNodePrefix++ + '_';
    this._prefixCallback = prefixCallback || noop;
    this._inversePredicate = false;
    this._quantified = Object.create(null);
    if (!tripleCallback) {
      var triples = [], error;
      this._callback = function (e, t) { e ? (error = e) : t && triples.push(t); };
      this._lexer.tokenize(input).every(function (token) {
        return self._readCallback = self._readCallback(token);
      });
      if (error) throw error;
      return triples;
    }
    this._callback = tripleCallback;
    this._lexer.tokenize(input, function (error, token) {
      if (error !== null)
        self._callback(error), self._callback = noop;
      else if (self._readCallback)
        self._readCallback = self._readCallback(token);
    });
  },
};
function noop() {}

N3.Parser = N3Parser;

})();
(function () {
var N3LiteralMatcher = /^"([^]*)"(?:\^\^(.+)|@([\-a-z]+))?$/i;
var RDF_PREFIX = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    RDF_TYPE   = RDF_PREFIX + 'type';
var escape    = /["\\\t\n\r\b\f\u0000-\u0019\ud800-\udbff]/,
    escapeAll = /["\\\t\n\r\b\f\u0000-\u0019]|[\ud800-\udbff][\udc00-\udfff]/g,
    escapeReplacements = {
      '\\': '\\\\', '"': '\\"', '\t': '\\t',
      '\n': '\\n', '\r': '\\r', '\b': '\\b', '\f': '\\f',
    };
function N3Writer(outputStream, options) {
  if (!(this instanceof N3Writer))
    return new N3Writer(outputStream, options);
  if (outputStream && typeof outputStream.write !== 'function')
    options = outputStream, outputStream = null;
  options = options || {};
  if (!outputStream) {
    var output = '';
    this._outputStream = {
      write: function (chunk, encoding, done) { output += chunk; done && done(); },
      end:   function (done) { done && done(null, output); },
    };
    this._endStream = true;
  }
  else {
    this._outputStream = outputStream;
    this._endStream = options.end === undefined ? true : !!options.end;
  }
  this._subject = null;
  if (!(/triple|quad/i).test(options.format)) {
    this._graph = '';
    this._prefixIRIs = Object.create(null);
    options.prefixes && this.addPrefixes(options.prefixes);
  }
  else {
    this._writeTriple = this._writeTripleLine;
  }
}

N3Writer.prototype = {
  _write: function (string, callback) {
    this._outputStream.write(string, 'utf8', callback);
  },
  _writeTriple: function (subject, predicate, object, graph, done) {
    try {
      if (this._graph !== graph) {
        this._write((this._subject === null ? '' : (this._graph ? '\n}\n' : '.\n')) +
                    (graph ? this._encodeIriOrBlankNode(graph) + ' {\n' : ''));
        this._subject = null;
        this._graph = graph[0] !== '[' ? graph : ']';
      }
      if (this._subject === subject) {
        if (this._predicate === predicate)
          this._write(', ' + this._encodeObject(object), done);
        else
          this._write(';\n    ' +
                      this._encodePredicate(this._predicate = predicate) + ' ' +
                      this._encodeObject(object), done);
      }
      else
        this._write((this._subject === null ? '' : '.\n') +
                    this._encodeSubject(this._subject = subject) + ' ' +
                    this._encodePredicate(this._predicate = predicate) + ' ' +
                    this._encodeObject(object), done);
    }
    catch (error) { done && done(error); }
  },
  _writeTripleLine: function (subject, predicate, object, graph, done) {
    delete this._prefixMatch;
    try {
      this._write(this._encodeIriOrBlankNode(subject) + ' ' +
                  this._encodeIriOrBlankNode(predicate) + ' ' +
                  this._encodeObject(object) +
                  (graph ? ' ' + this._encodeIriOrBlankNode(graph) + '.\n' : '.\n'), done);
    }
    catch (error) { done && done(error); }
  },
  _encodeIriOrBlankNode: function (entity) {
    var firstChar = entity[0];
    if (firstChar === '[' || firstChar === '(' || firstChar === '_' && entity[1] === ':')
      return entity;
    if (escape.test(entity))
      entity = entity.replace(escapeAll, characterReplacer);
    var prefixMatch = this._prefixRegex.exec(entity);
    return !prefixMatch ? '<' + entity + '>' :
           (!prefixMatch[1] ? entity : this._prefixIRIs[prefixMatch[1]] + prefixMatch[2]);
  },
  _encodeLiteral: function (value, type, language) {
    if (escape.test(value))
      value = value.replace(escapeAll, characterReplacer);
    if (language)
      return '"' + value + '"@' + language;
    else if (type)
      return '"' + value + '"^^' + this._encodeIriOrBlankNode(type);
    else
      return '"' + value + '"';
  },
  _encodeSubject: function (subject) {
    if (subject[0] === '"')
      throw new Error('A literal as subject is not allowed: ' + subject);
    if (subject[0] === '[')
      this._subject = ']';
    return this._encodeIriOrBlankNode(subject);
  },
  _encodePredicate: function (predicate) {
    if (predicate[0] === '"')
      throw new Error('A literal as predicate is not allowed: ' + predicate);
    return predicate === RDF_TYPE ? 'a' : this._encodeIriOrBlankNode(predicate);
  },
  _encodeObject: function (object) {
    if (object[0] !== '"')
      return this._encodeIriOrBlankNode(object);
    var match = N3LiteralMatcher.exec(object);
    if (!match) throw new Error('Invalid literal: ' + object);
    return this._encodeLiteral(match[1], match[2], match[3]);
  },
  _blockedWrite: function () {
    throw new Error('Cannot write because the writer has been closed.');
  },
  addTriple: function (subject, predicate, object, graph, done) {
    if (object === undefined)
      this._writeTriple(subject.subject, subject.predicate, subject.object,
                        subject.graph || '', predicate);
    else if (typeof graph !== 'string')
      this._writeTriple(subject, predicate, object, '', graph);
    else
      this._writeTriple(subject, predicate, object, graph, done);
  },
  addTriples: function (triples) {
    for (var i = 0; i < triples.length; i++)
      this.addTriple(triples[i]);
  },
  addPrefix: function (prefix, iri, done) {
    var prefixes = {};
    prefixes[prefix] = iri;
    this.addPrefixes(prefixes, done);
  },
  addPrefixes: function (prefixes, done) {
    var prefixIRIs = this._prefixIRIs, hasPrefixes = false;
    for (var prefix in prefixes) {
      var iri = prefixes[prefix];
      if (/[#\/]$/.test(iri) && prefixIRIs[iri] !== (prefix += ':')) {
        hasPrefixes = true;
        prefixIRIs[iri] = prefix;
        if (this._subject !== null) {
          this._write(this._graph ? '\n}\n' : '.\n');
          this._subject = null, this._graph = '';
        }
        this._write('@prefix ' + prefix + ' <' + iri + '>.\n');
      }
    }
    if (hasPrefixes) {
      var IRIlist = '', prefixList = '';
      for (var prefixIRI in prefixIRIs) {
        IRIlist += IRIlist ? '|' + prefixIRI : prefixIRI;
        prefixList += (prefixList ? '|' : '') + prefixIRIs[prefixIRI];
      }
      IRIlist = IRIlist.replace(/[\]\/\(\)\*\+\?\.\\\$]/g, '\\$&');
      this._prefixRegex = new RegExp('^(?:' + prefixList + ')[^\/]*$|' +
                                     '^(' + IRIlist + ')([a-zA-Z][\\-_a-zA-Z0-9]*)$');
    }
    this._write(hasPrefixes ? '\n' : '', done);
  },
  blank: function (predicate, object) {
    var children = predicate, child, length;
    if (predicate === undefined)
      children = [];
    else if (typeof predicate === 'string')
      children = [{ predicate: predicate, object: object }];
    else if (!('length' in predicate))
      children = [predicate];

    switch (length = children.length) {
    case 0:
      return '[]';
    case 1:
      child = children[0];
      if (child.object[0] !== '[')
        return '[ ' + this._encodePredicate(child.predicate) + ' ' +
                      this._encodeObject(child.object) + ' ]';
    default:
      var contents = '[';
      for (var i = 0; i < length; i++) {
        child = children[i];
        if (child.predicate === predicate)
          contents += ', ' + this._encodeObject(child.object);
        else {
          contents += (i ? ';\n  ' : '\n  ') +
                      this._encodePredicate(child.predicate) + ' ' +
                      this._encodeObject(child.object);
          predicate = child.predicate;
        }
      }
      return contents + '\n]';
    }
  },
  list: function (elements) {
    var length = elements && elements.length || 0, contents = new Array(length);
    for (var i = 0; i < length; i++)
      contents[i] = this._encodeObject(elements[i]);
    return '(' + contents.join(' ') + ')';
  },
  _prefixRegex: /$0^/,
  end: function (done) {
    if (this._subject !== null) {
      this._write(this._graph ? '\n}\n' : '.\n');
      this._subject = null;
    }
    this._write = this._blockedWrite;
    var singleDone = done && function (error, result) { singleDone = null, done(error, result); };
    if (this._endStream) {
      try { return this._outputStream.end(singleDone); }
      catch (error) { /* error closing stream */ }
    }
    singleDone && singleDone();
  },
};
function characterReplacer(character) {
  var result = escapeReplacements[character];
  if (result === undefined) {
    if (character.length === 1) {
      result = character.charCodeAt(0).toString(16);
      result = '\\u0000'.substr(0, 6 - result.length) + result;
    }
    else {
      result = ((character.charCodeAt(0) - 0xD800) * 0x400 +
                 character.charCodeAt(1) + 0x2400).toString(16);
      result = '\\U00000000'.substr(0, 10 - result.length) + result;
    }
  }
  return result;
}

N3.Writer = N3Writer;

})();
(function () {

var expandPrefixedName = N3.Util.expandPrefixedName;
function N3Store(triples, options) {
  if (!(this instanceof N3Store))
    return new N3Store(triples, options);
  this._size = 0;
  this._graphs = Object.create(null);
  this._id = 0;
  this._ids = Object.create(null);
  this._ids['><'] = 0; // dummy entry, so the first actual key is non-zero
  this._entities = Object.create(null); // inverse of `_ids`
  this._blankNodeIndex = 0;
  if (!options && triples && !triples[0])
    options = triples, triples = null;
  options = options || {};
  this._prefixes = Object.create(null);
  if (options.prefixes)
    this.addPrefixes(options.prefixes);
  if (triples)
    this.addTriples(triples);
}

N3Store.prototype = {
  get size() {
    var size = this._size;
    if (size !== null)
      return size;
    var graphs = this._graphs, subjects, subject;
    for (var graphKey in graphs)
      for (var subjectKey in (subjects = graphs[graphKey].subjects))
        for (var predicateKey in (subject = subjects[subjectKey]))
          size += Object.keys(subject[predicateKey]).length;
    return this._size = size;
  },
  _addToIndex: function (index0, key0, key1, key2) {
    var index1 = index0[key0] || (index0[key0] = {});
    var index2 = index1[key1] || (index1[key1] = {});
    var existed = key2 in index2;
    if (!existed)
      index2[key2] = null;
    return !existed;
  },
  _removeFromIndex: function (index0, key0, key1, key2) {
    var index1 = index0[key0], index2 = index1[key1], key;
    delete index2[key2];
    for (key in index2) return;
    delete index1[key1];
    for (key in index1) return;
    delete index0[key0];
  },
  _findInIndex: function (index0, key0, key1, key2, name0, name1, name2, graph) {
    var results = [], tmp, index1, index2, varCount = !key0 + !key1 + !key2,
        entityKeys = varCount > 1 ? Object.keys(this._ids) : this._entities;
    if (key0) (tmp = index0, index0 = {})[key0] = tmp[key0];
    for (var value0 in index0) {
      var entity0 = entityKeys[value0];

      if (index1 = index0[value0]) {
        if (key1) (tmp = index1, index1 = {})[key1] = tmp[key1];
        for (var value1 in index1) {
          var entity1 = entityKeys[value1];

          if (index2 = index1[value1]) {
            var values = key2 ? (key2 in index2 ? [key2] : []) : Object.keys(index2);
            for (var l = values.length - 1; l >= 0; l--) {
              var result = { subject: '', predicate: '', object: '', graph: graph };
              result[name0] = entity0;
              result[name1] = entity1;
              result[name2] = entityKeys[values[l]];
              results.push(result);
            }
          }
        }
      }
    }
    return results;
  },
  _countInIndex: function (index0, key0, key1, key2) {
    var count = 0, tmp, index1, index2;
    if (key0) (tmp = index0, index0 = {})[key0] = tmp[key0];
    for (var value0 in index0) {
      if (index1 = index0[value0]) {
        if (key1) (tmp = index1, index1 = {})[key1] = tmp[key1];
        for (var value1 in index1) {
          if (index2 = index1[value1]) {
            if (key2) (key2 in index2) && count++;
            else count += Object.keys(index2).length;
          }
        }
      }
    }
    return count;
  },
  addTriple: function (subject, predicate, object, graph) {
    if (!predicate)
      graph = subject.graph, object = subject.object,
        predicate = subject.predicate, subject = subject.subject;
    graph = graph || '';
    var graphItem = this._graphs[graph];
    if (!graphItem) {
      graphItem = this._graphs[graph] = { subjects: {}, predicates: {}, objects: {} };
      Object.freeze(graphItem);
    }
    var ids = this._ids;
    var entities = this._entities;
    subject   = ids[subject]   || (ids[entities[++this._id] = subject]   = this._id);
    predicate = ids[predicate] || (ids[entities[++this._id] = predicate] = this._id);
    object    = ids[object]    || (ids[entities[++this._id] = object]    = this._id);

    var changed = this._addToIndex(graphItem.subjects,   subject,   predicate, object);
    this._addToIndex(graphItem.predicates, predicate, object,    subject);
    this._addToIndex(graphItem.objects,    object,    subject,   predicate);
    this._size = null;
    return changed;
  },
  addTriples: function (triples) {
    for (var i = triples.length - 1; i >= 0; i--)
      this.addTriple(triples[i]);
  },
  addPrefix: function (prefix, iri) {
    this._prefixes[prefix] = iri;
  },
  addPrefixes: function (prefixes) {
    for (var prefix in prefixes)
      this.addPrefix(prefix, prefixes[prefix]);
  },
  removeTriple: function (subject, predicate, object, graph) {
    if (!predicate)
      graph = subject.graph, object = subject.object,
        predicate = subject.predicate, subject = subject.subject;
    graph = graph || '';
    var graphItem, ids = this._ids, graphs = this._graphs;
    if (!(subject   = ids[subject]))   return false;
    if (!(predicate = ids[predicate])) return false;
    if (!(object    = ids[object]))    return false;
    if (!(graphItem = graphs[graph]))  return false;
    var subjects, predicates;
    if (!(subjects   = graphItem.subjects[subject])) return false;
    if (!(predicates = subjects[predicate])) return false;
    if (!(object in predicates)) return false;
    this._removeFromIndex(graphItem.subjects,   subject,   predicate, object);
    this._removeFromIndex(graphItem.predicates, predicate, object,    subject);
    this._removeFromIndex(graphItem.objects,    object,    subject,   predicate);
    if (this._size !== null) this._size--;
    for (subject in graphItem.subjects) return true;
    delete graphs[graph];
    return true;
  },
  removeTriples: function (triples) {
    for (var i = triples.length - 1; i >= 0; i--)
      this.removeTriple(triples[i]);
  },
  find: function (subject, predicate, object, graph) {
    var prefixes = this._prefixes;
    return this.findByIRI(
      expandPrefixedName(subject,   prefixes),
      expandPrefixedName(predicate, prefixes),
      expandPrefixedName(object,    prefixes),
      expandPrefixedName(graph,     prefixes)
    );
  },
  findByIRI: function (subject, predicate, object, graph) {
    var quads = [], graphs = {}, graphContents,
        ids = this._ids, subjectId, predicateId, objectId;
    if (!isString(graph))
      graphs = this._graphs;
    else
      graphs[graph] = this._graphs[graph];
    if (isString(subject)   && !(subjectId   = ids[subject]))   return quads;
    if (isString(predicate) && !(predicateId = ids[predicate])) return quads;
    if (isString(object)    && !(objectId    = ids[object]))    return quads;

    for (var graphId in graphs) {
      if (graphContents = graphs[graphId]) {
        if (subjectId) {
          if (objectId)
            quads.push(this._findInIndex(graphContents.objects, objectId, subjectId, predicateId,
                                         'object', 'subject', 'predicate', graphId));
          else
            quads.push(this._findInIndex(graphContents.subjects, subjectId, predicateId, null,
                                         'subject', 'predicate', 'object', graphId));
        }
        else if (predicateId)
          quads.push(this._findInIndex(graphContents.predicates, predicateId, objectId, null,
                                       'predicate', 'object', 'subject', graphId));
        else if (objectId)
          quads.push(this._findInIndex(graphContents.objects, objectId, null, null,
                                       'object', 'subject', 'predicate', graphId));
        else
          quads.push(this._findInIndex(graphContents.subjects, null, null, null,
                                       'subject', 'predicate', 'object', graphId));
      }
    }
    return quads.length === 1 ? quads[0] : quads.concat.apply([], quads);
  },
  count: function (subject, predicate, object, graph) {
    var prefixes = this._prefixes;
    return this.countByIRI(
      expandPrefixedName(subject,   prefixes),
      expandPrefixedName(predicate, prefixes),
      expandPrefixedName(object,    prefixes),
      expandPrefixedName(graph,     prefixes)
    );
  },
  countByIRI: function (subject, predicate, object, graph) {
    var count = 0, graphs = {}, graphContents,
        ids = this._ids, subjectId, predicateId, objectId;
    if (!isString(graph))
      graphs = this._graphs;
    else
      graphs[graph] = this._graphs[graph];
    if (isString(subject)   && !(subjectId   = ids[subject]))   return 0;
    if (isString(predicate) && !(predicateId = ids[predicate])) return 0;
    if (isString(object)    && !(objectId    = ids[object]))    return 0;

    for (var graphId in graphs) {
      if (graphContents = graphs[graphId]) {
        if (subject) {
          if (object)
            count += this._countInIndex(graphContents.objects, objectId, subjectId, predicateId);
          else
            count += this._countInIndex(graphContents.subjects, subjectId, predicateId, objectId);
        }
        else if (predicate) {
          count += this._countInIndex(graphContents.predicates, predicateId, objectId, subjectId);
        }
        else {
          count += this._countInIndex(graphContents.objects, objectId, subjectId, predicateId);
        }
      }
    }
    return count;
  },
  createBlankNode: function (suggestedName) {
    var name, index;
    if (suggestedName) {
      name = suggestedName = '_:' + suggestedName, index = 1;
      while (this._ids[name])
        name = suggestedName + index++;
    }
    else {
      do { name = '_:b' + this._blankNodeIndex++; }
      while (this._ids[name]);
    }
    this._ids[name] = ++this._id;
    this._entities[this._id] = name;
    return name;
  },
};
function isString(s) {
  return typeof s === 'string' || s instanceof String;
}

N3.Store = N3Store;

})();
})(typeof exports !== "undefined" ? exports : this.N3 = {});
});
                (function() {
                    window.require(["ace/ext/n3-browser"], function() {});
                })();
            