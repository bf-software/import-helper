import * as cs from './collectionSupport';
import * as ss from './systemSupport';
import { L } from './systemSupport';
import * as qt from './quickTest';


qt.module( () => {

  qt.section('FFArray', () => {
    let a = new cs.FfArray<string>('a','b','c','d','e','f','g');

    qt.test('by value', () => {
      let found = a.byValue('c');
      qt.testValue(found).shouldBeDefined;
      if (found) {
        qt.testValue(found.index).shouldEqual(2);
        qt.testValue(found.value).shouldEqual('c');
      }

    });

    qt.test('by non existing value', () => {
      let found = a.byValue('x');
      qt.testValue(found).shouldBeUndefined;

    });


    qt.test('by index', () => {
      let  found = a.byIndex(6);
      qt.testValue(found).shouldBeDefined;
      if (found) {
        qt.testValue(found.index).shouldEqual(6);
        qt.testValue(found.value).shouldEqual('g');
      }

    });

    qt.test('by non existing index', () => {
      let found = a.byIndex(100);
      qt.testValue(found).shouldBeUndefined;

    });

    qt.test('first and last', () => {
      let found = a.first;
      qt.testValue(found).shouldBeDefined;
      if (found) {
        qt.testValue(found.index).shouldEqual(0);
        qt.testValue(found.value).shouldEqual('a');
      }

      found = a.last;
      qt.testValue(found).shouldBeDefined;
      if (found) {
        qt.testValue(found.index).shouldEqual(6);
        qt.testValue(found.value).shouldEqual('g');
      }

    });

    qt.test('delete', () => {
      let called = 0;
      a.onBeforeDelete.doOnce( (item) => {
        qt.testValue(item.index).shouldEqual(6);
        qt.testValue(item.value).shouldEqual('g');
        called++;
      });
      a.delete(6);
      qt.testValue(a.byIndex(6)).shouldBeUndefined;
      qt.testValue(called).shouldEqual(1);
    });

    qt.test('pop', () => {
      let called = 0;
      a.onBeforeDelete.doOnce( (item) => {
        qt.testValue(item.index).shouldEqual(5);
        qt.testValue(item.value).shouldEqual('f');
        called++;
      });
      qt.testValue(a.pop()).shouldEqual('f');
      qt.testValue(called).shouldEqual(1);
    });

  });


  qt.section('FFSortedArray', () => {
    let a = new cs.FfSortedArray<string>('c','a','b'); // should be sorted to 'a', 'b', 'c'

    qt.test('by value', () => {
      let found = a.byValue('c');
      qt.testValue(found).shouldBeDefined;
      if (found) {
        qt.testValue(found.index).shouldEqual(2);
        qt.testValue(found.value).shouldEqual('c');
      }

    });

    qt.test('by non existing value', () => {
      let found = a.byValue('x');
      qt.testValue(found).shouldBeUndefined;

    });

    qt.test('insert',  () => {
      a.add('g','d','f','e');
      qt.testValue(a.length).shouldEqual(7);
    });

    qt.test('by index',  () => {
      let  found = a.byIndex(6);
      qt.testValue(found).shouldBeDefined;
      if (found) {
        qt.testValue(found.index).shouldEqual(6);
        qt.testValue(found.value).shouldEqual('g');
      }

    });

    qt.test('by non existing index', () => {
      let found = a.byIndex(100);
      qt.testValue(found).shouldBeUndefined;
    });

    qt.test('first and last', () => {
      let found = a.first;
      qt.testValue(found).shouldBeDefined;
      if (found) {
        qt.testValue(found.index).shouldEqual(0);
        qt.testValue(found.value).shouldEqual('a');
      }

      found = a.last;
      qt.testValue(found).shouldBeDefined;
      if (found) {
        qt.testValue(found.index).shouldEqual(6);
        qt.testValue(found.value).shouldEqual('g');
      }

    });

    qt.test('delete', () => {
      let called = 0;
      a.onBeforeDelete.doOnce( (item) => {
        qt.testValue(item.index).shouldEqual(6);
        qt.testValue(item.value).shouldEqual('g');
        called++;
      });
      a.delete(6);
      qt.testValue(a.byIndex(6)).shouldBeUndefined;
      qt.testValue(called).shouldEqual(1);
    });

    qt.test('pop', () => {
      let called = 0;
      a.onBeforeDelete.doOnce( (item) => {
        qt.testValue(item.index).shouldEqual(5);
        qt.testValue(item.value).shouldEqual('f');
        called++;
      });
      qt.testValue(a.pop()).shouldEqual('f');
      qt.testValue(called).shouldEqual(1);
    });


  });


  qt.section('FFUniqueSortedArray', () => {
    let a = new cs.FfUniqueSortedArray<string>('c','a','b','a','a');

    qt.test('by value', () => {
      let found = a.byValue('c');
      qt.testValue(found).shouldBeDefined;
      if (found) {
        qt.testValue(found.index).shouldEqual(2);
        qt.testValue(found.value).shouldEqual('c');
      }
    });

    qt.test('ignore duplicates', () => {
      a.add('c');
      qt.testValue(a.length).shouldEqual(3);
    });

  });


  qt.section('FFMap', () => {
    let m = new cs.FfMap<string,number>();
    m.set('a',1);
    m.set('b',2);
    m.set('c',3);
    m.set('d',4);
    m.set('e',5);
    m.set('f',6);
    m.set('g',7);

    qt.test('by key', () => {
      let found = m.byKey('c');
      qt.testValue(found).shouldBeDefined;
      if (found) {
        qt.testValue(found.key).shouldEqual('c');
        qt.testValue(found.value).shouldEqual(3);
      }

    });

    qt.test('by non existing key', () => {
      let found = m.byKey('x');
      qt.testValue(found).shouldBeUndefined;
    });

    qt.test('by value', () => {
      let found = m.byValue(3);
      qt.testValue(found).shouldBeDefined;
      if (found) {
        qt.testValue(found.index).shouldEqual(2);
        qt.testValue(found.value).shouldEqual(3);
        qt.testValue(found.key).shouldEqual('c');
      }
    });

    qt.test('by non existing value', () => {
      let found = m.byValue(100);
      qt.testValue(found).shouldBeUndefined;
    });

    qt.test('by index', () => {
      qt.testValue(m.size).shouldEqual(7);
      let found = m.byIndex(6);
      qt.testValue(found).shouldBeDefined;
      if (found) {
        qt.testValue(found.index).shouldEqual(6);
        qt.testValue(found.key).shouldEqual('g');
        qt.testValue(found.value).shouldEqual(7);
      }
    });

    qt.test('by non existing index', () => {
      let found = m.byIndex(100);
      qt.testValue(found).shouldBeUndefined;
    });

  });


  qt.section('FFOrderedMap', () => {
    let initial = Array<[string,number]>(['c',3],['b',2],['a',1]);
    let map = new cs.FfOrderedMap<string,number>(initial);

    qt.test('reordering', () => {
      qt.testValue(Array.from(map)).shouldDeepEqual(initial);
      qt.testValue(map.first?.key).shouldEqual('c');
      qt.testValue(map.last?.key).shouldEqual('a');
      map.move(2,0);
      map.moveToLast(1);
      qt.testValue(Array.from(map)).shouldDeepEqual([['a',1],['b',2],['c',3]]);
    });

  });

  qt.section('FFSortedMap', () => {
    let map = new cs.FfSortedMap<string,number>([['z',3],['a',1],['q',2]]);

    qt.test('initialization', () => {
      qt.testValue(Array.from(map.keys())).shouldDeepEqual(['a','q','z']);
    });

    qt.test('partial key find', () =>  {
      map.clear();
      qt.testValue(map.size).shouldEqual(0);

      map.setFromArray([
        ['apple',1],
        ['banana',2],
        ['orange',3],
        ['orange pear',4],
        ['orange pear pineapple',5],
        ['mangosteen',6],
        ['passion',7],
        ['rambutan',8]
      ]);

      qt.testValue(map.byPartialKey('orange')?.value).shouldEqual(3);
      qt.testValue(map.byPartialKey('orange p')?.value).shouldEqual(4);
      qt.testValue(map.byPartialKey('orange X')).shouldBeUndefined;

    });

  });


  qt.section('DualKeyMap', () => {

    class Data {
      constructor(
        public value:number
      ){}
    }

    let mainKey1 = new Data(1);
    let mainKey2 = new Data(2);
    let mainKey3 = new Data(2);
    let mainKey4 = new Data(2);
    let secondKey1 = new Data(1);
    let secondKey2 = new Data(2);

    qt.test('fast key searches', () => {
      let map = new cs.FfDualKeyMap<Data,Data,string>();
      map.setFromArray([
        [mainKey1, secondKey1, 'm1s1'],
        [mainKey2, secondKey2, 'm2s2'],
        [mainKey3, secondKey2, 'm3s2'],
        [mainKey4, secondKey2, 'm4s2']
      ]);

      qt.testValue(map.size).shouldEqual(4);

      qt.testValue(map.byKeys(mainKey4,secondKey2)).shouldBeDefined;
      qt.testValue(map.byKeys(mainKey4,secondKey2)?.value).shouldEqual('m4s2');

      qt.testValue(map.byKey1(mainKey1)).shouldBeDefined;
      qt.testValue(map.byKey1(mainKey1)?.key2Map.size).shouldEqual(1);
      qt.testValue(map.byKey1(mainKey1)?.key2Map.first?.value).shouldEqual('m1s1');

      qt.testValue(map.byKey2(secondKey2)).shouldBeDefined;
      qt.testValue(map.byKey2(secondKey2)?.key1Map.size).shouldEqual(3);
      qt.testValue(map.byKey2(secondKey2)?.key1Map.first?.key1).shouldEqual(mainKey2);
      qt.testValue(map.byKey2(secondKey2)?.key1Map.last?.key1).shouldEqual(mainKey4);
    });

    qt.test('overwriting existing items', () => {
      let map = new cs.FfDualKeyMap<number,number,string>();
      map.set(1,1,'1-1');
      map.set(1,2,'1-2');
      map.set(1,3,'1-3');

      qt.testValue(map.size).shouldEqual(3);

      map.set(1,2,'1-2X');

      qt.testValue(map.size).shouldEqual(3);

      qt.testValue( map.byKeys(1,2)?.value ).shouldEqual('1-2X');

    });

    qt.test('deletes', () => {
      let map = new cs.FfDualKeyMap<number,number,string>();
      map.set(1,1,'1-1');
      map.set(2,2,'2-2');
      map.set(3,3,'3-X');

      qt.testValue(map.size).shouldEqual(3);
      qt.testValue(map.delete(3,3)).shouldEqual(true);
      qt.testValue(map.size).shouldEqual(2);

      map.set(4,4,'4-4');
      map.set(5,4,'5-4');
      map.set(6,4,'6-4');
      map.set(7,4,'7-4');

      qt.testValue(map.size).shouldEqual(6);
      qt.testValue(map.deleteKey2(4)).shouldEqual(true);
      qt.testValue(map.size).shouldEqual(2);

    });

    qt.test('iterators', () => {
      let map = new cs.FfDualKeyMap<number,number,string>();
      map.set(1,1,'1-1');
      map.set(2,2,'2-2');
      map.set(3,3,'3-3');
      map.set(4,7,'4-7');
      map.set(5,7,'5-7');
      map.set(6,7,'6-7');
      map.set(8,9,'8-9');
      map.set(8,10,'8-10');
      map.set(8,11,'8-11');

      qt.testValue( Array.from(map) ).shouldDeepEqual(
        [
          [ 1, 1, '1-1' ],
          [ 2, 2, '2-2' ],
          [ 3, 3, '3-3' ],
          [ 4, 7, '4-7' ],
          [ 5, 7, '5-7' ],
          [ 6, 7, '6-7' ],
          [ 8, 9, '8-9' ],
          [ 8, 10, '8-10' ],
          [ 8, 11, '8-11' ]
        ]
      );

    });

    qt.test('case insensitivity', () => {
      let map = new cs.FfDualKeyMap<string,string,number>([
        ['a','b',1]
      ]);
      // map.setFromArray([

      // ]);

      qt.testValue(()=>{
        map.useLowercaseKey1 = true;
      }).shouldThrowError;

      map.clear();
      map.useLowercaseKey1 = true;

      map.setFromArray([
        ['a','b',1],
        ['c','d',2],
        ['E','F',3]
      ]);

      qt.testValue(map.byKeys('E','F')?.value).shouldEqual(3);
      qt.testValue(map.byKeys('e','F')?.value).shouldEqual(3);
      qt.testValue(map.byKeys('e','f')?.value).shouldBeUndefined;

      map.clear();
      map.useLowercaseKey1 = false;
      map.useLowercaseKey2 = true;

      map.setFromArray([
        ['a','b',1],
        ['c','d',2],
        ['E','F',3]
      ]);

      qt.testValue(map.byKeys('E','F')?.value).shouldEqual(3);
      qt.testValue(map.byKeys('E','f')?.value).shouldEqual(3);
      qt.testValue(map.byKeys('e','f')?.value).shouldBeUndefined;

    });

  });

});
