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
        controller: 'View1Ctrl',
        activetab: 'editor'
    });
}])

.service('dictionary', function() {

    var dictMap = new Map();
    var objVal = [];
    var subVal = [];
    var predVal = [];

    dictMap.set('obj', objVal);
    dictMap.set('sub', subVal);
    dictMap.set('pred', predVal);

    this.contains = function(k, v) {
        if (dictMap.get(k).indexOf(v) === -1)
            return false;
        return true;
    };

    this.put = function(k, v) {
        dictMap.get(k).push(v);
    }
})

.service('share', function() {
    var sharedVariables = {};
    return {
        getSharedVariables: function() {
            return sharedVariables;
        },
        setVariable: function(paramName, value) {
            sharedVariables[paramName] = value;
        }
    };
})

.service('RdfSeasService', function($http, dictionary, share) {
    var proxy = 'http://54.91.114.123:8080/';

    this.fillcompleters = function(ns, iri, callbackFunc) {

        console.log('Going to fetch: ' + iri);
        share.getSharedVariables().setLoading("seas", true);

        $http({
            method: 'GET',
            url: proxy + iri,
            headers: {
                'Accept': 'text/turtle'
            }
        }).then(function successCallback(response) {
                console.log('fetch success');
                console.log(response);
                var uri = 'https://example.org/';
                var mimeType = 'text/turtle';
                var store = $rdf.graph();
                var seaswordlist = [];

                $rdf.parse(response.data, store, uri, mimeType);
                //console.log(store.statements);
                store.statements.forEach(function(statement) {

                    if (statement.predicate.value.indexOf('imports') !== -1) {
                        var newiri = statement.object.value.replace(uri, iri);
                        $http({
                            method: 'GET',
                            //url: 'http://54.91.114.123:8080/' + newiri,
                            url: proxy + newiri,
                            headers: {
                                'Accept': 'text/turtle'
                            }
                        }).then(function successCallback(response) {
                            //console.log(response);
                            var newstore = $rdf.graph();
                            $rdf.parse(response.data, newstore, newiri, 'text/turtle');
                            var seaswordlistSub = [];
                            var seaswordlistPred = [];
                            var seaswordlistObj = [];
                            newstore.statements.forEach(function(eachst) {
                                try {
                                    if ((eachst.object.value.indexOf("http://www.w3.org/2000/01/rdf-schema#Class") !== -1) ||
                                        (eachst.object.value.indexOf("http://www.w3.org/2002/07/owl#Class") !== -1)) {
                                        if (eachst.subject.value.startsWith('https://w3id.org/seas') && !eachst.subject.value.includes('#_')) {
                                            if (seaswordlistSub.indexOf(eachst.subject.value.replace('https://w3id.org/seas/', "")) === -1) {
                                                seaswordlistSub.push('seas:' + eachst.subject.value.replace('https://w3id.org/seas/', ""));
                                                dictionary.put('sub', eachst.subject.value);
                                            }
                                        }
                                    } else if ((eachst.object.value.indexOf("http://www.w3.org/2002/07/owl#AnnotationProperty") !== -1) ||
                                        (eachst.object.value.indexOf("http://www.w3.org/2002/07/owl#DatatypeProperty") !== -1) ||
                                        (eachst.object.value.indexOf("http://www.w3.org/2002/07/owl#ObjectProperty") !== -1) ||
                                        (eachst.object.value.indexOf("http://www.w3.org/2002/07/owl#TransitiveProperty") !== -1) ||
                                        (eachst.object.value.indexOf("http://www.w3.org/2002/07/owl#SymmetricProperty") !== -1) ||
                                        (eachst.object.value.indexOf("http://www.w3.org/2002/07/owl#ReflexiveProperty") !== -1) ||
                                        (eachst.object.value.indexOf("http://www.w3.org/2002/07/owl#IrreflexiveProperty") !== -1) ||
                                        (eachst.object.value.indexOf("http://www.w3.org/2002/07/owl#InverseFunctionalProperty") !== -1) ||
                                        (eachst.object.value.indexOf("http://www.w3.org/2002/07/owl#FunctionalProperty") !== -1) ||
                                        (eachst.object.value.indexOf("http://www.w3.org/2002/07/owl#DeprecatedProperty") !== -1) ||
                                        (eachst.object.value.indexOf("http://www.w3.org/2002/07/owl#AsymmetricProperty") !== -1) ||
                                        (eachst.object.value.indexOf("http://www.w3.org/2002/07/owl#OntologyProperty") !== -1) ||
                                        (eachst.object.value.indexOf("http://www.w3.org/1999/02/22-rdf-syntax-ns#Property") !== -1)) {

                                        if (eachst.subject.value.startsWith('https://w3id.org/seas') && !eachst.subject.value.includes('#_')) {
                                            if (seaswordlistPred.indexOf(eachst.subject.value.replace('https://w3id.org/seas/', "")) === -1) {
                                                seaswordlistPred.push('seas:' + eachst.subject.value.replace('https://w3id.org/seas/', ""));
                                                dictionary.put('pred', eachst.subject.value);
                                            }
                                        }
                                    }
                                } catch (err) {
                                    //Current bug. TypeError is thrown when object is a collection type in statement
                                    console.log('typeerror')
                                }
                            });

                            if (seaswordlistObj.length > 0) {
                                var objectCompleter = {
                                    identifierRegexps: [/seas:/],
                                    getCompletions: function(editor, session, pos, prefix, callback) {
                                        var wordList = seaswordlistObj;
                                        callback(null, wordList.map(function(word) {
                                            return {
                                                caption: word,
                                                value: word,
                                                meta: ns + ":" + 'Obj'
                                            };
                                        }));
                                    }
                                };
                                share.getSharedVariables().completers.push(objectCompleter);
                            }

                            if (seaswordlistSub.length > 0) {
                                var objectCompleter = {
                                    identifierRegexps: [/seas:/],
                                    getCompletions: function(editor, session, pos, prefix, callback) {
                                        var wordList = seaswordlistSub;
                                        callback(null, wordList.map(function(word) {
                                            return {
                                                caption: word,
                                                value: word,
                                                meta: ns + ":" + 'Concept'
                                            };
                                        }));
                                    }
                                };
                                share.getSharedVariables().completers.push(objectCompleter);
                            }
                            if (seaswordlistPred.length > 0) {
                                var objectCompleter = {
                                    identifierRegexps: [/seas:/],
                                    getCompletions: function(editor, session, pos, prefix, callback) {
                                        var wordList = seaswordlistPred;
                                        callback(null, wordList.map(function(word) {
                                            return {
                                                caption: word,
                                                value: word,
                                                meta: ns + ":" + 'Pred'
                                            };
                                        }));
                                    }
                                };
                                share.getSharedVariables().completers.push(objectCompleter);
                            }
                            share.getSharedVariables().setLoading("seas", false);
                        }, function(err) {
                            //share.getSharedVariables().setLoading("seas", false);
                            console.log('fucked up - could not retrieve seas ontology uri:');
                        });
                    }

                });
            },
            function errorCallback(response) {
                //processRdfXmlCallback(ns, uri, format, 'fail');
                console.log('unable to process seas');
                urimessages.push('could not retrieve uri:' + iri);

            });
    };
})

.service('RdfService', function($http, dictionary, share) {
    this.fillcompleters = function(ns, uri, format) {
        var proxy = 'http://54.91.114.123:8080/';

        var store = $rdf.graph();
        var parsed = false;
        share.getSharedVariables().setLoading("others", true);

        $http({
            method: 'GET',
            url: proxy + uri,
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
                    if (format === 'application/rdf+xml')
                        share.getSharedVariables().processRdfXmlCallback(ns, uri, format, 'pass');
                    else
                        share.getSharedVariables().processRdfXmlCallback(ns, uri, format, 'fail');
                }
                var wordlistSub = [];
                var wordlistPred = [];
                var wordlistObj = [];

                store.statements.forEach(function(st) {
                    try {
                        if ((st.object.value.indexOf("http://www.w3.org/2000/01/rdf-schema#Class") !== -1) ||
                            (st.object.value.indexOf("http://www.w3.org/2002/07/owl#Class") !== -1)) {
                            if (!(uri === st.subject.value || uri === st.subject.value + '/') && st.subject.value.startsWith(uri)) {
                                dictionary.put('sub', st.subject.value);
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
                        } else if (
                            (st.object.value.indexOf("http://www.w3.org/2002/07/owl#AnnotationProperty") !== -1) ||
                            (st.object.value.indexOf("http://www.w3.org/2002/07/owl#DatatypeProperty") !== -1) ||
                            (st.object.value.indexOf("http://www.w3.org/2002/07/owl#ObjectProperty") !== -1) ||
                            (st.object.value.indexOf("http://www.w3.org/2002/07/owl#TransitiveProperty") !== -1) ||
                            (st.object.value.indexOf("http://www.w3.org/2002/07/owl#SymmetricProperty") !== -1) ||
                            (st.object.value.indexOf("http://www.w3.org/2002/07/owl#ReflexiveProperty") !== -1) ||
                            (st.object.value.indexOf("http://www.w3.org/2002/07/owl#IrreflexiveProperty") !== -1) ||
                            (st.object.value.indexOf("http://www.w3.org/2002/07/owl#InverseFunctionalProperty") !== -1) ||
                            (st.object.value.indexOf("http://www.w3.org/2002/07/owl#FunctionalProperty") !== -1) ||
                            (st.object.value.indexOf("http://www.w3.org/2002/07/owl#DeprecatedProperty") !== -1) ||
                            (st.object.value.indexOf("http://www.w3.org/2002/07/owl#AsymmetricProperty") !== -1) ||
                            (st.object.value.indexOf("http://www.w3.org/2002/07/owl#OntologyProperty") !== -1) ||
                            (st.object.value.indexOf("http://www.w3.org/1999/02/22-rdf-syntax-ns#Property") !== -1)) {
                            if (!(uri === st.subject.value || uri === st.subject.value + '/') && st.subject.value.startsWith(uri)) {
                                dictionary.put('pred', st.subject.value);
                                if (uri.indexOf('#') > -1) {
                                    if (st.subject.value.split('#')[1] !== '')
                                        if (wordlistPred.indexOf(ns + ":" + st.subject.value.split('#')[1]) === -1)
                                            wordlistPred.push(ns + ":" + st.subject.value.split('#')[1]);
                                } else {
                                    if (wordlistPred.indexOf(ns + ":" + st.subject.value.replace(uri, "")) === -1)
                                        wordlistPred.push(ns + ":" + st.subject.value.replace(uri, ""));
                                }
                            }
                        }
                    } catch (err) {
                        //Current bug. TypeError is thrown when object is a collection type in statement
                        console.log('typeerror')
                    }
                });

                var myreg = "/[" + ns + "]+/";
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
                                    meta: ns + ":Concept"
                                };
                            }));
                        }
                    };
                    share.getSharedVariables().completers.push(subjectCompleter);
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
                    share.getSharedVariables().completers.push(predicateCompleter);
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
                    share.getSharedVariables().completers.push(objectCompleter);
                }
                share.getSharedVariables().setLoading("others", false);
            },
            function errorCallback(response) {
                share.getSharedVariables().setLoading("others", false);
                share.getSharedVariables().processRdfXmlCallback(ns, uri, format, 'fail');
            });
    }
})

.service('prefixService', function($http, share) {
    this.prefixCompleter = function() {

        $http({
            method: 'GET',
            url: 'http://prefix.cc/popular/all.file.json',
            headers: {
                'Accept': 'application/json'
            }
        }).then(function successCallback(response) {
            //var arr = Object.keys(response.data).map(function(k) { return response.data[k] });
            var arr = Object.keys(response.data).map(function(k) { return k + ": <" + response.data[k] + "> ." });
            share.setVariable("prefix", arr);
            //console.log(arr);
            //Create prefix completer
            if (arr.length > 0) {
                var objectCompleter = {
                    identifierRegexps: [/@prefix\s+/],
                    getCompletions: function(editor, session, pos, prefix, callback) {
                        var wordList = arr;
                        if (prefix.length === 0) { callback(null, []); return; }
                        callback(null, wordList.map(function(word) {
                            return {
                                caption: word,
                                value: word,
                                meta: "prefix"
                            };
                        }));
                    }
                };
                //share.getSharedVariables().completers.push(objectCompleter);
                share.setVariable("prefixcompleter", objectCompleter);
            }

        }, function errorCallback(err) {
            console.log(err);
        });
    }
})

.controller('View1Ctrl', function($rootScope, $scope, $http, RdfService, RdfSeasService, prefixService, $route, dictionary, share) {

    $rootScope.$on("annotate", function(event, data) {
        //deletes the item from list from view
        console.log('the fuck just hapened');
    });
    //Javascript utility function
    Array.prototype.remove = function() {
        var what, a = arguments,
            L = a.length,
            ax;
        while (L && this.length) {
            what = a[--L];
            while ((ax = this.indexOf(what)) != -1) {
                this.splice(ax, 1);
            }
        }
        return this;
    };

    //dictionary
    $scope.$route = $route;
    $scope.isFullScreen = false;

    // The modes
    $scope.modes = ['Turtle'];
    $scope.mode = $scope.modes[0];
    $scope.store = $rdf.graph();
    $scope.loading = false;
    $scope.completers = [];
    share.setVariable("completers", $scope.completers);
    $scope.uriprocessed = [];
    $scope.uridetected = [];
    $scope.urimessages = [];
    $scope.statementmessages = [];
    $scope.inprocess = [];
    $scope.editor = null;
    $scope.basiccompleterwords = ["@prefix", "@base"];
    $scope.anglebracketcompleterwords = [];
    $scope.coloncompleterwords = [];
    $scope.currentError = '';

    $scope.closeAlert = function(index) {
        $scope.alerts.splice(index, 1);
    };

    $scope.homeactive = true;

    $scope.fullScreen = function() {
        $scope.isFullScreen = !$scope.isFullScreen;
        console.log('Full screen clicked');
    }

    prefixService.prefixCompleter();

    // Yeah remove
    angular.element(window).on('annotate', function() {

    });

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

            $scope.editor = _ace;

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
            _session.setOverwrite(true);
            _renderer.setShowGutter(true);

            //console.log(_ace);

            _ace.completers = $scope.completers;

            //Below code inserts a marker line on editor
            var Range = ace.require("ace/range").Range;
            //_session.addMarker(new Range(2, 0, 3, 500), "warningHell", "half");

            var basiccompleter = {
                identifierRegexps: [/[@]+/],
                getCompletions: function(editor, session, pos, prefix, callback) {

                    //Below code changes the width of completers topup
                    if (!editor.completer) { editor.completer = new Autocomplete(); }
                    editor.completer.$init();
                    var popup = editor.completer.popup;
                    popup.container.style.width = "600px";
                    popup.resize();

                    var wordList = $scope.basiccompleterwords;
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

            var angleBracketCompleter = {
                identifierRegexps: [/[<]+/],
                getCompletions: function(editor, session, pos, prefix, callback) {

                    //Below code changes the width of completers topup
                    //if (!editor.completer) { editor.completer = new Autocomplete(); }
                    //editor.completer.$init();
                    //var popup = editor.completer.popup;
                    //popup.container.style.width = "600px";
                    //popup.resize();

                    var wordList = $scope.anglebracketcompleterwords;
                    callback(null, wordList.map(function(word) {
                        return {
                            caption: word,
                            value: word,
                            meta: "local"
                        };
                    }));
                }
            }

            $scope.completers.push(angleBracketCompleter);

            var colonCompleter = {
                identifierRegexps: [/[:]/],
                getCompletions: function(editor, session, pos, prefix, callback) {
                    var wordList = $scope.coloncompleterwords;
                    callback(null, wordList.map(function(word) {
                        return {
                            caption: word,
                            value: word,
                            meta: "local"
                        };
                    }));
                }
            }

            $scope.completers.push(colonCompleter);

            //below code sets annotation on gutter of editor
            _ace.getSession().setAnnotations([{
                row: 1,
                column: 0,
                text: "Session Changed", // Or the Json reply from the parser 
                type: "error" // also warning and information
            }]);

            // Events
            _ace.on("changeSession", function() {
                console.log('session changed');
            });
            _session.on("change", function() {

                var text = '';
                //parse for text words
                _session.doc.$lines.forEach(function(line) {
                    if (!line.startsWith('#')) {
                        text += line + ' ';
                        //process prefixes
                    }
                });

                //feature: insert prefix when known namespace is added
                var currline = _ace.getSelectionRange().start.row;
                var wholelinetxt = _ace.session.getLine(currline);
                wholelinetxt = wholelinetxt.replace(/ +/g, ' ');

                if (!wholelinetxt.startsWith('@prefix') &&
                    //wholelinetxt.split(':').length > 1 &&
                    wholelinetxt.split(' ')[wholelinetxt.split(' ').length - 1].slice(-1) == ':') {

                    var namespace = wholelinetxt.split(' ')[wholelinetxt.split(' ').length - 1];
                    //console.log('whole line text: ' + wholelinetxt + '   et namespace is:' + namespace);
                    var prefixArr = share.getSharedVariables("prefix");
                    //console.log(prefixArr.prefix);
                    prefixArr.prefix.forEach(function(pref) {
                        //check if namespace is present in prefixed iri
                        if (pref.lastIndexOf(namespace, 0) === 0) {
                            //check if this prefix is already present in prefixed URIs
                            var index = $scope.uridetected.indexOf(pref.split('<')[1].split('>')[0]);
                            if (index === -1) {
                                //its not processed, add this prefix
                                //console.log(_session.doc.$lines);
                                //_ace.session.insert({ row: 1, column: 0 }, "@prefix " + pref + '\r\n');
                                _session.doc.insertLines(1, ["@prefix " + pref]);
                                var row = _ace.getSelectionRange().start.row;
                                _ace.gotoLine(row + 1, _ace.session.getLine(row).length);
                                //console.log(wholelinetxt);

                                //_session.doc.removeLines(row, row);
                                //_session.remove(new Range(row, 0, row, Number.MAX_VALUE), wholelinetxt);

                                //_ace.session.insertNewLine({ row: currline, column: 0 });
                                //replace current line text | NOT WORKING!!
                                //var row = _ace.getSelectionRange().start.row;
                                //_ace.session.replace(new Range(row, 0, row, Number.MAX_VALUE), wholelinetxt);
                                //console.log(_session.doc.$lines);
                                $scope.uridetected.push(pref.split('<')[1].split('>')[0]);
                            }
                        }
                    });
                }

                //resule prefix autocompleter issues
                if (wholelinetxt.startsWith('@prefix')) {
                    share.getSharedVariables().completers.push(share.getSharedVariables().prefixcompleter);
                } else if (!wholelinetxt.startsWith('@prefix')) {
                    var index = share.getSharedVariables().completers.indexOf(share.getSharedVariables().prefixcompleter);
                    //console.log('index is:' + index);
                    if (index > -1) {
                        share.getSharedVariables().completers.remove(share.getSharedVariables().prefixcompleter);
                    }
                }

                //Parse it to see if its a valid document or not yet.
                try {

                    //Process prefixes for autocompletion
                    var newurilist = [];
                    _session.doc.$lines.forEach(function(line1) {
                        var line = line1.replace(/ +/g, ' ');
                        var lineUri = line.replace(/['@']+prefix+\s+[a-zA-Z0-9]+[':']+\s*<[a-zA-Z]*['s://'?'://']*?[a-zA-Z0-9-_./#?=]+>\s+./g, "thisisuri");
                        //console.log(lineUri);

                        if (lineUri.indexOf("thisisuri") !== -1) {
                            var thisuri = line.split(' ')[2];
                            var start_pos = thisuri.indexOf('<') + 1;
                            var end_pos = thisuri.indexOf('>', start_pos);
                            var finalthisuri = thisuri.substring(start_pos, end_pos);
                            //console.log(finalthisuri);
                            newurilist.push({ iri: finalthisuri, ns: line.split(' ')[1].split(':')[0] });
                        }
                    });

                    var urichanged = false;
                    newurilist.forEach(function(uri) {
                        if ($scope.uriprocessed.indexOf(uri.iri) === -1) {
                            $scope.uriprocessed.push(uri.iri);
                            $scope.uridetected.push(uri.iri);
                            if (uri.iri === 'http://ci.emse.fr/seas/' || uri.iri === 'https://w3id.org/seas/' || uri.iri === 'http://ci.emse.fr/seas' || uri.iri === 'https://w3id.org/seas') {
                                console.log('seas detected');
                                //processSeas(uri.ns, uri.iri, $scope.completers, processRdfXmlCallback);
                                RdfSeasService.fillcompleters(uri.ns, uri.iri);
                            } else {
                                RdfService.fillcompleters(uri.ns, uri.iri, 'application/rdf+xml');
                            }
                            urichanged = true;
                        }
                    });
                    //repace all uriprocessed entries with newrilist.iri
                    if (urichanged) {
                        $scope.uriprocessed = [];
                        newurilist.forEach(function(uri) {
                            $scope.uriprocessed.push(uri.iri);
                            $scope.uridetected.push(uri.iri);
                        });
                    }

                    //Try parsing the document
                    var uri = 'https://example.org/resource.ttl';
                    var mimeType = 'text/turtle';
                    var store = $rdf.graph();

                    $scope.statementmessages = [];
                    $scope.urimessages = [];
                    text.replace(/^#!.*\n/, "\n").match(/[^\r\n]+/g);
                    $rdf.parse(_session.doc.getValue(), store, uri, mimeType);
                    $scope.messages = [];

                    var prefixtemparray = [];

                    var bagOfWords = text.split(" ");

                    //Warning for any statements not present in URI
                    $scope.status = '';

                    store.statements.forEach(function(st) {
                        if (!dictionary.contains('sub', st.subject.value)) {
                            $scope.statementmessages.remove('Subject term is not found: ' + st.subject.value);
                            $scope.statementmessages.push('Subject term is not found: ' + st.subject.value);
                            //console.log(st.subject.value);
                        }
                        if (!dictionary.contains('pred', st.predicate.value)) {
                            $scope.statementmessages.remove('Predicate term is not found: ' + st.predicate.value);
                            $scope.statementmessages.push('Predicate term is not found: ' + st.predicate.value);
                        }
                        if (!dictionary.contains('sub', st.object.value)) {
                            $scope.statementmessages.remove('Object term is not found: ' + st.object.value);
                            $scope.statementmessages.push('Object term is not found: ' + st.object.value);
                            //console.log(st.object.value);
                        }
                        //Auto-completion within this document
                        if (st.subject.value.lastIndexOf("https://example.org", 0) === 0) {
                            //https://example.org/resource.ttl#hammad
                            //https://example.org/hammad
                            if (st.subject.value.indexOf('#') !== -1) {
                                $scope.coloncompleterwords.remove(':' + st.subject.value.split('#')[1]);
                                $scope.coloncompleterwords.push(':' + st.subject.value.split('#')[1]);
                            } else {
                                $scope.anglebracketcompleterwords.remove('<' + st.subject.value.replace('https://example.org/', '') + '>');
                                $scope.anglebracketcompleterwords.push('<' + st.subject.value.replace('https://example.org/', '') + '>');
                            }
                        }
                    });
                    $scope.currentError = '';
                } catch (err) {
                    $scope.currentError = err.toString().split('\n')[1];
                    //console.log(err);
                }
            });
        }
    };

    var processRdfXmlCallback = function(ns, uri, mime, result) {
        if (result !== 'fail') {
            RdfService.fillcompleters(ns, uri, 'text/turtle');
        } else {
            if ($scope.urimessages.indexOf(uri) === -1) {
                $scope.urimessages.push('could not retrieve uri: ' + uri);
            }
            var index = $scope.uriprocessed.indexOf(uri);
            if (index > -1) {
                $scope.uriprocessed.splice(index, 1);
            }
        }
    }

    share.setVariable("processRdfXmlCallback", processRdfXmlCallback);

    var setLoading = function(name, val) {

        if (val == false) {
            for (var i = 0; i < $scope.inprocess.length; i++) {
                if ($scope.inprocess[i].name == name) {
                    $scope.inprocess.splice(i, 1);
                }
            }
        } else {
            $scope.inprocess.push({ 'name': name, 'value': val });
        }

        if ($scope.inprocess.length < 1)
            $scope.loading = false;
        else
            $scope.loading = true;
    }
    share.setVariable("setLoading", setLoading);
    $scope.aceModel = "";
});