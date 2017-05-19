define("ace/mode/turtle_highlight_rules",["require","exports","module","ace/lib/oop","ace/mode/text_highlight_rules"], function(require, exports, module) {
    "use strict";

    var oop = require("../lib/oop");
    var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;
    var identifierRe = "[a-zA-Z\\$_\u00a1-\uffff][a-zA-Z\\d\\$_\u00a1-\uffff]*";
    var iri = "<([a-z]*['s://'?'://']*?[a-zA-Z0-9-_./#?=]+)>";
    var blanknode = "(['_:']+[a-zA-Z0-9]*)";
    var prefixedname = "([a-zA-Z0-9-?]+[-]*[':'])+[a-zA-Z0-9-_?]*";
    var literal = "(['\"']+[a-zA-Z0-9-_.#]+['\"']['\^\^xsd:']*['STRING|INTEGER|FLOAT']*)";

    var TurtleHighlightRules = function() {

        var keywordMapper = this.createKeywordMapper({
            "variable.language": "false", // Pseudo
            "keyword": "@prefix|@base|PREFIX|BASE",
            "storage.type": "const|let|var|function",
            "constant.language": "@prefix|@base|a",
            "support.function": "alert",
            "constant.language.boolean": "true|false",
            "rdf.statement": ""

        }, "identifier");

        var kwBeforeRe = "case|do|else|finally|in|instanceof|return|throw|try|typeof|yield|void";
        this.$rules = {
            "start": [{
                    token: "comment",
                    regex: "#.*$"
                },
                { //directive
                    token: "comment",
                    regex: '@prefix|PREFIX',
                    next: "pname_ns"
                },
                { //directive
                    token: "comment",
                    regex: '@base|BASE',
                    next: "iriref"
                },
                { //triples-SUBJECT-predicate-object
                    token: "constant.language.boolean",
                    regex: iri + "|" + prefixedname + "|" + blanknode,
                    next: "predicate"
                },
                {
                    token: keywordMapper,
                    regex: identifierRe
                },
                {
                    token: keywordMapper,
                    regex: "\\-?[a-zA-Z_][a-zA-Z0-9_\\-]*"
                }
            ],
            "pname_ns": [{
                token: function(value) {
                    if (/[a-zA-Z0-9-_?]*[':']+/.test(value)) {
                        return "constant.language.boolean";
                    } else {
                        return "invalid";
                    }
                },
                regex: "([a-zA-Z0-9-_?:]+)",
                next: "iriref"
            }],
            "iriref": [{
                token: "line.markup",
                regex: "<([a-zA-Z]*['s://'?'://']*?[a-zA-Z0-9-_./#?=]+)>",
                next: "dot"
            }],
            "dot": [{
                token: function(value) {
                    if (/[.]/.test(value)) {
                        return "constant.language.boolean";
                    } else {
                        return "invalid";
                    }
                },
                regex: "[a-zA-Z0-9-_./#?=]+",
                next: "start"
            }],
            "iri": [{
                token: "constant.language.boolean",
                regex: "<([a-zA-Z]*['s://'?'://']*?[a-zA-Z0-9-_./#?=]+)>",
            }],
            "prefixedname": [{
                token: "list.markup",
                regex: "([a-zA-Z0-9]+)",
            }],
            "predicate": [{
                token: "support.function",
                regex: iri + "|" + prefixedname + "|a",
                next: "object"
            }],
            "object": [{
                token: "variable.language",
                regex: iri + "|" + prefixedname + "|" + blanknode + "|" + literal,
                next: "nexttoobject",
                caseInsensitive: true
            }],
            "nexttoobject": [{
                token: "constant.language.boolean",
                regex: "['.']",
                next: "start"
            }, {
                token: "constant.language.boolean",
                regex: "[',']",
                next: "object"
            }, {
                token: "support.function",
                regex: ";",
                next: "predicate"
            }],
            "hex": [{
                token: "paran.lparan",
                regex: "[0-9]|[A-F]|[a-f]",
            }]
        };
    };

    oop.inherits(TurtleHighlightRules, TextHighlightRules);
    exports.TurtleHighlightRules = TurtleHighlightRules;
});

define("ace/mode/matching_brace_outdent",["require","exports","module","ace/range"], function(require, exports, module) {
"use strict";

var Range = require("../range").Range;

var MatchingBraceOutdent = function() {};

(function() {

    this.checkOutdent = function(line, input) {
        if (! /^\s+$/.test(line))
            return false;

        return /^\s*\}/.test(input);
    };

    this.autoOutdent = function(doc, row) {
        var line = doc.getLine(row);
        var match = line.match(/^(\s*\})/);

        if (!match) return 0;

        var column = match[1].length;
        var openBracePos = doc.findMatchingBracket({row: row, column: column});

        if (!openBracePos || openBracePos.row == row) return 0;

        var indent = this.$getIndent(doc.getLine(openBracePos.row));
        doc.replace(new Range(row, 0, row, column-1), indent);
    };

    this.$getIndent = function(line) {
        return line.match(/^\s*/)[0];
    };

}).call(MatchingBraceOutdent.prototype);

exports.MatchingBraceOutdent = MatchingBraceOutdent;
});

define("ace/mode/turtle",["require","exports","module","ace/lib/oop","ace/mode/text","ace/mode/turtle_highlight_rules","ace/mode/matching_brace_outdent","ace/worker/worker_client"], function(require, exports, module) {

    var oop = require("ace/lib/oop");
    var TextMode = require("./text").Mode;
    var TurtleHighlightRules = require("./turtle_highlight_rules").TurtleHighlightRules;
    var MatchingBraceOutdent = require("./matching_brace_outdent").MatchingBraceOutdent;

    var Mode = function() {
        this.HighlightRules = TurtleHighlightRules;
    };
    oop.inherits(Mode, TextMode);

    (function() {
        var WorkerClient = require("../worker/worker_client").WorkerClient;
        this.createWorker = function(session) {
            var worker = new WorkerClient(["ace"], "ace/mode/turtle_worker", "TurtleWorker");
            worker.attachToDocument(session.getDocument());

            worker.on("annotate", function(results) {
                session.setAnnotations(results.data);
            });

            worker.on("somecallback", function(results) {
                console.log("SOMECALLBACK DETECTED");
                console.log(results);
            });

            worker.on("terminate", function() {
                session.clearAnnotations();
            });

            return worker;
        };
        this.$id = "ace/mode/tutle";
    }).call(Mode.prototype);

    exports.Mode = Mode;
});
