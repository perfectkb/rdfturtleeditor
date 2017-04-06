'use strict';

describe('rdfeditor.version module', function() {
    beforeEach(module('rdfeditor.version'));

    describe('version service', function() {
        it('should return current version', inject(function(version) {
            expect(version).toEqual('0.1');
        }));
    });
});