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

.controller('View1Ctrl', function($scope) {

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
            enableLiveAutocompletion: true
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

            // Events
            _ace.on("changeSession", function() { console.log('session changed') });
            _session.on("change", function() { console.log(' content changed ') });
        }
    };

    // Initial code content...
    $scope.aceModel = '#Directives \n' +
        '#prefix/base\n' +
        '@prefix ns: <http://something.com> .\n' +
        '@base <http://www.dhs.com> .\n\n' +
        '#sparql prefix/base\n' +
        'PREFIX ns: <http://something.com>.\n' +
        'BASE <http://www.abc.com> .\n\n' +
        '#Triplets\n' +
        '#triplets in all possible forms\n' +
        'ns:sub ns:pred ns:obj, ns:anotherObj, "literalObj","literalObj"^^xsd:String;\n' +
        'ns:newPred ns:obj.\n\n' +
        '#blank nodes\n' +
        'ns:newSub ns:newPred _:blankNode .\n' +
        '#predicate cannot be blank node. Color not changing is error condition \n' +
        '_:blankSub _:djs ns:newspace ';
});