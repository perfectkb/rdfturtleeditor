'use strict';

// Declare app level module which depends on views, and components
angular.module('rdfeditor', [
    'ngRoute',
    'rdfeditor.view1',
    'rdfeditor.view2',
    'rdfeditor.version',
    'ui.ace',
    'ng-mfb',
    'angularScreenfull'
]).
directive('isActiveNav', ['$location', function($location) {
    return {
        restrict: 'A',
        link: function(scope, element) {
            scope.location = $location;
            scope.$watch('location.path()', function(currentPath) {
                if ('#!' + currentPath === element[0].attributes['href'].nodeValue) {
                    element.parent().addClass('active');
                } else {
                    element.parent().removeClass('active');
                }
            });
        }
    };
}]).
config(['$locationProvider', '$routeProvider', function($locationProvider, $routeProvider) {
    $locationProvider.hashPrefix('!');
    $routeProvider.otherwise({ redirectTo: '/editor' });
}]);