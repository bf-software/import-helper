import * as qt from './quickTest';

qt.module( () => {

  qt.section('deepEqual', () => {

    qt.test('primitives', () => {
      let result = qt.deepEqual(1,1);
      qt.testValue(result.isEqual).shouldBeTrue;
    });

    qt.test('arrays', () => {
      let result = qt.deepEqual([1,2,3,4],[1,2,3]);
      qt.testValue(result.isEqual).shouldBeFalse;
      qt.testValue(result.aValue).shouldEqual(4);
      qt.testValue(result.bIsMissing).shouldBeTrue;
    });

    qt.test('maps', () => {
      let result = qt.deepEqual( new Map([[1,0],[2,0],[3,0]]), new Map([[1,0],[2,0],[3,0]]) );
      qt.testValue(result.isEqual).shouldBeTrue;
    });

    qt.test('other', () => {
      let result = qt.deepEqual(/123/,/123/);
      qt.testValue(result.isEqual).shouldBeTrue;
    });

  });

});