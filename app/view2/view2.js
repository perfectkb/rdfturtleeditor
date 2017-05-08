'use strict';

angular.module('rdfeditor.view2', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/help', {
        templateUrl: 'view2/view2.html',
        controller: 'View2Ctrl',
        activetab: 'help'
    });
}])

.controller('View2Ctrl', [function() {

}]);