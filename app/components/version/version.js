'use strict';

angular.module('rdfeditor.version', [
    'rdfeditor.version.interpolate-filter',
    'rdfeditor.version.version-directive'
])

.value('version', '0.1');