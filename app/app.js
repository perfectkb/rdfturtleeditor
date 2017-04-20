'use strict';

// Declare app level module which depends on views, and components
angular.module('rdfeditor', [
    'ngRoute',
    'rdfeditor.view1',
    'rdfeditor.view2',
    'rdfeditor.version',
    'ui.ace'
]).
config(['$locationProvider', '$routeProvider', function($locationProvider, $routeProvider) {
    $locationProvider.hashPrefix('!');
    $routeProvider.otherwise({ redirectTo: '/editor' });
}]);