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

.controller('View1Ctrl', function($scope, $http) {

    // The modes
    $scope.modes = ['Turtle'];
    $scope.mode = $scope.modes[0];

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
            fontSize: '16px',
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

            var completer = {
                identifierRegexps: [/[a-zA-Z_0-9]/],
                getCompletions: function(editor, session, pos, prefix, callback) {
                    var wordList = ["seas", "foaf"];
                    callback(null, wordList.map(function(word) {
                        return {
                            caption: word,
                            value: word,
                            meta: "namespace"
                        };
                    }));
                }
            }

            var seas = {
                identifierRegexps: [/[seas:]+/],
                getCompletions: function(editor, session, pos, prefix, callback) {
                    var wordList = ["seas:device", "seas:meter"];
                    callback(null, wordList.map(function(word) {
                        return {
                            caption: word,
                            value: word,
                            meta: "seas"
                        };
                    }));
                }
            }

            var foaf = {
                identifierRegexps: [/[foaf:]+/],
                getCompletions: function(editor, session, pos, prefix, callback) {
                    var wordList = ["foaf:knows", "foaf:person"];
                    callback(null, wordList.map(function(word) {
                        return {
                            caption: word,
                            value: word,
                            meta: "foaf"
                        };
                    }));
                }
            }

            console.log(_ace);
            _ace.completers = [completer, seas, foaf];
            //console.log(_ace);

            // Events
            _ace.on("changeSession", function() { console.log('session changed') });
            _session.on("change", function() {
                //console.log(' content changed ')
                //console.log(_session.doc);
            });
        }
    };

    /*$http.get('http://localhost:8080/https://w3id.org/seas/SigFoxCommunicationDevice')
        .success(function(data) {
            //$scope.names = eval(data);
            console.log(data);
            var uri = 'https://example.org/resource.ttl';
            var mimeType = 'text/turtle';
            //var store = $scope.$rdf.graph();
        })
        .error(function(data) {
            alert(data);
            console.log('Error: ' + data);
        });
        */
    // Initial code content...

    $scope.aceModel = "#Directives\n" +
        "#prefix/base correct sytnax\n" +
        "@prefix ns: <http://prefix.com#> .\n" +
        "@prefix xsd: <http://toto.com> .\n" +
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

});