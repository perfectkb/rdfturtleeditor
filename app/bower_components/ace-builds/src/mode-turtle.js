/*
 * Copyright 2017 ENGIE 'Smart Energy Aware Systems' SEAS Project. 
 * Licensed under [license], Version 1.0 (the "License"); 
 * you may not use this file except in compliance with the License. 
 * You may obtain a copy of the License at 
 * 
 * [license URL]
 * 
 * Unless required by applicable law or agreed to in writing, software 
 * distributed under the License is distributed on an "AS IS" BASIS, 
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. 
 * See the License for the specific language governing permissions and 
 * limitations under the License. 
 */

define('ace/mode/turtle', function(require, exports, module) {

    var oop = require("ace/lib/oop");
    var TextMode = require("ace/mode/text").Mode;
    var TurtleHighlightRules = require("ace/mode/turtle_highlight_rules").TurtleHighlightRules;

    var Mode = function() {
        this.HighlightRules = TurtleHighlightRules;
    };
    oop.inherits(Mode, TextMode);

    (function() {
        // Extra logic goes here. (see below)
    }).call(Mode.prototype);

    exports.Mode = Mode;
});

define('ace/mode/turtle_highlight_rules', function(require, exports, module) {
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

        // regexp must not have capturing parentheses. Use (?:) instead.
        // regexps are ordered -> the first match is used
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
                    //SUBJECT
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
                token: "constant.language.boolean",
                regex: "([a-zA-Z0-9-_?]+[':'])",
                next: "iriref"
            }],
            "iriref": [{
                token: "list.markup",
                regex: "<([a-z]*['s://'?'://']*?[a-zA-Z0-9-_./#?=]+)>",
                next: "dot"
            }],
            "dot": [{
                token: "list.markup",
                regex: "['.'?]",
                next: "start"
            }],
            "iri": [{
                token: "constant.language.boolean",
                regex: "<([a-z]*['s://'?'://']*?[a-zA-Z0-9-_./#?=]+)>",
                //next: "dot"
            }],
            "prefixedname": [{
                token: "list.markup",
                regex: "([a-zA-Z0-9]+)",
                //next: "dot"
            }],
            "predicate": [{
                //triples-subject-PREDICATE-object
                //PREDICATE
                token: "support.function",
                regex: iri + "|" + prefixedname,
                next: "object"
            }],
            "object": [{
                //triples-subject-predicate-OBJECT
                //PREDICATE
                token: "variable.language",
                regex: iri + "|" + prefixedname + "|" + blanknode + "|" + literal,
                next: "nexttoobject",
                caseInsensitive: true
            }],
            "nexttoobject": [{
                //triples-subject-predicate-OBJECT
                //PREDICATE
                token: "constant.language.boolean",
                regex: "['.']",
                next: "start"
            }, {
                //triples-subject-predicate-OBJECT
                //PREDICATE
                token: "constant.language.boolean",
                regex: "[',']",
                next: "object"
            }, {
                //triples-subject-predicate-OBJECT
                //PREDICATE
                token: "support.function",
                regex: ";",
                next: "predicate"
            }],
            "hex": [{
                token: "paran.lparan",
                regex: "[0-9]|[A-F]|[a-f]",
                //next: "tag_stuff"
            }]
        };
    };

    oop.inherits(TurtleHighlightRules, TextHighlightRules);
    exports.TurtleHighlightRules = TurtleHighlightRules;
});