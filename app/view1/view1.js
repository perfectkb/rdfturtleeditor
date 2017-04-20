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

'use strict';

angular.module('rdfeditor.view1', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/editor', {
        templateUrl: 'view1/view1.html',
        controller: 'View1Ctrl'
    });
}])


.service('RdfService', function($http) {
    this.fillcompleters = function(ns, uri, format, completers, processRdfXmlCallback) {

        var store = $rdf.graph();
        var parsed = false;

        $http({
            method: 'GET',
            url: 'http://localhost:8080/' + uri,
            headers: {
                'Accept': format
            }
        }).then(function successCallback(response) {
                var urii = 'https://example.org/resource.ttl';
                var mimeType = format;
                try {
                    $rdf.parse(response.data, store, urii, mimeType);
                } catch (parseerror) {
                    console.log('parsing failed for format:' + mimeType + ' will now try format:rdf+xml');
                    if (format === 'text/turtle')
                        processRdfXmlCallback(ns, uri, format, 'pass');
                    else
                        processRdfXmlCallback(ns, uri, format, 'fail');
                }
                var wordlistSub = [];
                var wordlistPred = [];
                var wordlistObj = [];

                store.statements.forEach(function(st) {

                    if (!(uri === st.subject.value || uri === st.subject.value + '/') && st.subject.value.startsWith(uri)) {
                        if (uri.indexOf('#') > -1) {
                            if (st.subject.value.split('#')[1] !== '')
                                if (wordlistSub.indexOf(ns + ":" + st.subject.value.split('#')[1]) === -1) {
                                    wordlistSub.push(ns + ":" + st.subject.value.split('#')[1]);
                                }
                        } else {
                            if (wordlistSub.indexOf(ns + ":" + st.subject.value.replace(uri, "")) === -1)
                                wordlistSub.push(ns + ":" + st.subject.value.replace(uri, ""));
                        }
                    }
                    if (st.predicate.value.startsWith(uri)) {
                        if (uri.indexOf('#') > -1) {
                            if (st.predicate.value.split('#')[1] !== '')
                                if (wordlistPred.indexOf(ns + ":" + st.predicate.value.split('#')[1]) === -1)
                                    wordlistPred.push(ns + ":" + st.predicate.value.split('#')[1]);
                        } else {
                            if (wordlistPred.indexOf(ns + ":" + st.predicate.value.replace(uri, "")) === -1)
                                wordlistPred.push(ns + ":" + st.predicate.value.replace(uri, ""));
                        }
                    }
                    if (st.object.value.startsWith(uri)) {
                        if (uri.indexOf('#') > -1) {
                            if (st.object.value.split('#')[1] !== '')
                                if (wordlistObj.indexOf(ns + ":" + st.object.value.split('#')[1]) === -1)
                                    wordlistObj.push(ns + ":" + st.object.value.split('#')[1]);
                        } else {
                            if (wordlistObj.indexOf(ns + ":" + st.object.value.replace(uri, "")) === -1)
                                wordlistObj.push(ns + ":" + st.object.value.replace(uri, ""));
                        }
                    }
                });

                var myreg = "/[" + ns + ":]+/";
                var myregexp = new RegExp(myreg);

                //Put the subject completers
                if (wordlistSub.length > 0) {
                    var subjectCompleter = {
                        identifierRegexps: [myregexp],
                        getCompletions: function(editor, session, pos, prefix, callback) {
                            var wordList = wordlistSub;
                            callback(null, wordList.map(function(word) {
                                return {
                                    caption: word,
                                    value: word,
                                    meta: ns + ":Sub"
                                };
                            }));
                        }
                    };
                    completers.push(subjectCompleter);
                }

                //Put the predicate completers
                if (wordlistPred.length > 0) {
                    var predicateCompleter = {
                        identifierRegexps: [myregexp],
                        getCompletions: function(editor, session, pos, prefix, callback) {
                            var wordList = wordlistPred;
                            callback(null, wordList.map(function(word) {
                                return {
                                    caption: word,
                                    value: word,
                                    meta: ns + ":Pred"
                                };
                            }));
                        }
                    };
                    completers.push(predicateCompleter);
                }

                //Put the object completers
                if (wordlistObj.length > 0) {
                    var objectCompleter = {
                        identifierRegexps: [myregexp],
                        getCompletions: function(editor, session, pos, prefix, callback) {
                            var wordList = wordlistObj;
                            callback(null, wordList.map(function(word) {
                                return {
                                    caption: word,
                                    value: word,
                                    meta: ns + ":Obj"
                                };
                            }));
                        }
                    };
                    completers.push(objectCompleter);
                }
            },
            function errorCallback(response) {
                processRdfXmlCallback(ns, uri, format, 'fail');
            });
    }
})



.controller('View1Ctrl', function($scope, $http, RdfService) {

    // The modes
    $scope.modes = ['Turtle'];
    $scope.mode = $scope.modes[0];
    $scope.store = $rdf.graph();
    $scope.completers = [];
    $scope.uriprocessed = [];
    $scope.urimessages = [];
    $scope.statementmessages = [];

    // The ui-ace option
    $scope.aceOption = {
        mode: $scope.mode.toLowerCase(),
        useWrapMode: true,
        showGutter: true,
        theme: 'chrome',
        firstLineNumber: 1,
        require: ['ace/ext/language_tools'],
        advanced: {
            enableSnippets: true,
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: true,
            //fontFamily: 'Arial',
            fontSize: '12px',
            fontColor: 'RED'
        },
        rendererOptions: {
            maxLinks: Infinity,
            displayIndentGuides: true
        },
        onLoad: function(_ace) {

            // HACK to have the ace instance in the scope...
            $scope.modeChanged = function() {
                _ace.getSession().setMode("ace/mode/" + $scope.mode.toLowerCase());
            };

            // Editor part
            var _session = _ace.getSession();
            var _renderer = _ace.renderer;

            // Options
            _ace.setReadOnly(false);
            _session.setUndoManager(new ace.UndoManager());
            _renderer.setShowGutter(true);

            _ace.completers = $scope.completers;

            var basiccompleter = {
                identifierRegexps: [/[@]+/],
                getCompletions: function(editor, session, pos, prefix, callback) {
                    var wordList = ["@prefix", "@base"];
                    callback(null, wordList.map(function(word) {
                        return {
                            caption: word,
                            value: word,
                            meta: "local"
                        };
                    }));
                }
            }

            $scope.completers.push(basiccompleter);

            //console.log(_session.doc.$lines);

            // Events
            _ace.on("changeSession", function() { console.log('session changed') });
            _session.on("change", function() {
                //console.log(' content changed ')
                //console.log(_session.doc);
                var text = '';
                //Parse it to see if its a valid document or not yet.
                try {
                    var uri = 'https://example.org/resource.ttl';
                    var mimeType = 'text/turtle';
                    var store = $rdf.graph();
                    _session.doc.$lines.forEach(function(line) {
                        if (!line.startsWith('#'))
                            text += line + ' ';
                    });
                    $rdf.parse(text, store, uri, mimeType);
                    $scope.messages = [];
                    //No exception thrown in previous command so its a valid document
                    //Parse for prefixes
                    //console.log(store);
                    var prefixtemparray = [];
                    var iriRegex = new RegExp(/['@']+prefix+\s+[a-zA-Z0-9]+[':']+\s*<[a-zA-Z]*['s://'?'://']*?[a-zA-Z0-9-_./#?=]+>+/);

                    var bagOfWords = text.split(" ");
                    //$scope.uriprocessed =
                    var newurilist = [];
                    var curIndex = 0;
                    bagOfWords.forEach(function(curWord) {
                        if (curWord.includes('@prefix')) {
                            var thisuri = bagOfWords[curIndex + 2];
                            var start_pos = thisuri.indexOf('<') + 1;
                            var end_pos = thisuri.indexOf('>', start_pos);
                            var finalthisuri = thisuri.substring(start_pos, end_pos)
                            newurilist.push({ iri: finalthisuri, ns: bagOfWords[curIndex + 1].slice(0, -1) });
                        }
                        curIndex = curIndex + 1;
                    });

                    newurilist.forEach(function(uri) {
                        if ($scope.uriprocessed.indexOf(uri.iri) === -1) {
                            $scope.uriprocessed.push(uri.iri);
                            if (uri.iri === 'http://ci.emse.fr/seas/' || uri.iri === 'https://w3id.org/seas/' || uri.iri === 'http://ci.emse.fr/seas' || uri.iri === 'https://w3id.org/seas') {
                                console.log('seas detected');
                                processSeas(uri.ns, uri.iri, $scope.completers, processRdfXmlCallback);
                            } else {
                                RdfService.fillcompleters(uri.ns, uri.iri, 'text/turtle', $scope.completers, processRdfXmlCallback);
                            }
                        }
                    });
                    //repace all uriprocessed entries with newrilist.iri
                    $scope.uriprocessed = [];
                    newurilist.forEach(function(uri) {
                        $scope.uriprocessed.push(uri.iri);
                    });

                    //console.log(newurilist);
                } catch (err) {
                    //means not a valid document yet
                    //console.log(err);
                }
            });
        }
    };

    var processSeas = function(ns, iri, completers, callbackFunc) {
        console.log('Going to fetch: ' + iri);
        $http({
            method: 'GET',
            url: 'http://localhost:8080/' + iri,
            headers: {
                'Accept': 'application/rdf+xml'
            }
        }).then(function successCallback(response) {
                var uri = 'https://fuckoff.org/';
                var mimeType = 'application/rdf+xml';
                var store = $rdf.graph();
                var seaswordlist = [];

                $rdf.parse(response.data, store, uri, mimeType);
                store.statements.forEach(function(statement) {
                    if (statement.predicate.value.indexOf('imports') !== -1) {
                        var newiri = statement.object.value.replace(uri, iri);
                        $http({
                            method: 'GET',
                            url: 'http://localhost:8080/' + newiri,
                            headers: {
                                'Accept': 'text/turtle'
                            }
                        }).then(function successCallback(response) {
                            var newstore = $rdf.graph();
                            $rdf.parse(response.data, newstore, newiri, 'text/turtle');
                            var seaswordlistSub = [];
                            var seaswordlistPred = [];
                            var seaswordlistObj = [];
                            newstore.statements.forEach(function(eachst) {
                                try {
                                    if (eachst.subject.value.startsWith(iri) && !eachst.subject.value.includes('#_')) {
                                        if (seaswordlistSub.indexOf(eachst.subject.value.replace(iri, "")) === -1)
                                            seaswordlistSub.push('seas:' + eachst.subject.value.replace(iri, ""));
                                    }
                                    if (eachst.predicate.value.startsWith(iri) && !eachst.predicate.value.includes('#_')) {
                                        if (seaswordlistPred.indexOf(eachst.predicate.value.replace(iri, "")) === -1)
                                            seaswordlistPred.push('seas:' + eachst.predicate.value.replace(iri, ""));
                                    }
                                    if (eachst.object.value.startsWith(iri) && !eachst.object.value.includes('#_')) {
                                        if (seaswordlistObj.indexOf(eachst.object.value.replace(iri, "")) === -1)
                                            seaswordlistObj.push('seas:' + eachst.object.value.replace(iri, ""));
                                    }
                                } catch (err) {
                                    //Current bug. TypeError is thrown when object is a collection type in statement
                                    console.log('Fucking typeerror')
                                }
                            });
                            AddCompleter(seaswordlistObj, 'seas', 'Obj');
                            AddCompleter(seaswordlistSub, 'seas', 'Sub');
                            AddCompleter(seaswordlistPred, 'seas', 'Pred');
                        }, function(err) {
                            console.log('fucked up - could not retrieve seas ontology uri:');
                        });
                    }
                });
            },
            function errorCallback(response) {
                //processRdfXmlCallback(ns, uri, format, 'fail');
                urimessages.push('could not retrieve uri:' + iri);
                console.log('unable to process seas');
            });
    };

    //type is Sub/Pred/Obj
    var AddCompleter = function(list, ns, type) {
            if (list.length > 0) {
                var objectCompleter = {
                    identifierRegexps: [/seas:/],
                    getCompletions: function(editor, session, pos, prefix, callback) {
                        var wordList = list;
                        callback(null, wordList.map(function(word) {
                            return {
                                caption: word,
                                value: word,
                                meta: ns + ":" + type
                            };
                        }));
                    }
                };
                $scope.completers.push(objectCompleter);
            }
        }
        //console.log(RdfService.GetStatements('http://localhost:8080/https://w3id.org/seas/SigFoxCommunicationDevice'));

    // Initial code content...
    //RdfService.fillcompleters('RDFS', 'http://www.w3.org/2000/01/rdf-schema#', 'application/rdf+xml', $scope.completers);

    var processRdfXmlCallback = function(ns, uri, mime, result) {
        if (result !== 'fail') {
            RdfService.fillcompleters(ns, uri, 'application/rdf+xml', $scope.completers, processRdfXmlCallback);
        } else {
            //Print ERROR fatching URL message on UI
            console.log('ULTIMATE FAILURE for uri: ' + uri);
            if ($scope.urimessages.indexOf(uri) === -1)
                $scope.urimessages.push('could not retrieve uri: ' + uri);
        }
    }

    $scope.aceModel = "#Directives\n" +
        "#prefix/base correct sytnax\n" +
        "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n" +
        "@prefix foaf: <http://xmlns.com/foaf/0.1/> .\n" +
        "@base <http://www.base.com#> .\n\n" +

        "#syntax error when tried a namespace with base directive\n" +
        "@base  <http://something.com> .\n\n" +

        "#Triplets multiline  \n" +
        "ns:sub ns:pred ns:obj,ns:anotherObj; ns:hasvqlue \n" +
        "     \"dd\"^^xsd:string .\n\n" +

        "#blank nodes  \n" +
        "ns:newSub ns:newPred _:blankNode .\n" +

        "#error when the statement is not ended with a .\n" +
        "_:blankSub ns:djs ns:newspace .";

})

;