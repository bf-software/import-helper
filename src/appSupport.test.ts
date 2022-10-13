import * as qt from './common/quickTest';
import * as as from './appSupport';

qt.module( () => {

  qt.section('parsing identifiers', () => {

    function test(sourceLine:string, shouldExist:false):void;
    function test(sourceLine:string, text:string, startPos:number, isSymbol:boolean):void;
      function test(sourceLine:string, textOrExists:string|boolean, startPos:number = 0, isSymbol:boolean = false):void {
      let shouldExist = true;
      let text = '';
      if (typeof textOrExists == 'boolean')
        shouldExist = false;
      if (typeof textOrExists == 'string')
        text = String(textOrExists);

      let sourceLineStartPos = 100;
      let lineCursorPos = sourceLine.indexOf('|');
      if (lineCursorPos == -1)
        throw new Error('forgot to place the cursor in the test string (a pipe |)');
      sourceLine = sourceLine.replace('|','');
      let identifier = as.getSearchIdentifierNearCursor({
        sourceLine,
        sourceLineStartPos,
        lineCursorPos
      });

      if (shouldExist) {
        qt.testValue(identifier).shouldBeDefined;
        if (identifier) {
          qt.testValue(identifier!.text).shouldEqual(text);
          qt.testValue(identifier.startPos-100).shouldEqual(startPos);
        }
      } else {
        qt.testValue(identifier).shouldBeUndefined;
      }
    }


    qt.Otest('getSearchIdentifierNearCursor', () => {

          //          1111111111222222222233333333334
          //01234567890123456789012345678901234567890
      test('export class Abc|.defg', 'Abc', 13, true);

          //          1111111111222222222233333333334
          //01234567890123456789012345678901234567890
      test('let text = ss.cool|', 'ss', 11, false);

          //          1111111111222222222233333333334
          //01234567890123456789012345678901234567890
      test('export |', false);

          //          1111111111222222222233333333334
          //01234567890123456789012345678901234567890
      test('[]|', false);

          //          1111111111222222222233333333334
          //01234567890123456789012345678901234567890
      test('class Whatever extends |', 'Whatever', 6, true);

          //          1111111111222222222233333333334
          //01234567890123456789012345678901234567890
      test('"in the middle of nowhere".no|pe', false);

          //          1111111111222222222233333333334
          //01234567890123456789012345678901234567890
      test('let wow = thisIsGood.yu|p', 'thisIsGood', 10, false);

          //          1111111111222222222233333333334
          //01234567890123456789012345678901234567890
      test('let wow = this.nope |', false); // would return `this`, but `this` is not an identifier


          //          1111111111222222222233333333334
          //01234567890123456789012345678901234567890
      test('export class Test extends Nice |', 'Nice', 26, false); // this might be a module alias

          //          1111111111222222222233333333334
          //01234567890123456789012345678901234567890
      test('export class Test extends Ni|ce', 'Nice', 26, false); // same as above, but just with the cursor inside


          //          1111111111222222222233333333334
          //01234567890123456789012345678901234567890
      test('let wow = "nothing her|e"', false); // nothing importable on the left side of a let

          //          1111111111222222222233333333334
          //01234567890123456789012345678901234567890
      test('const wow = "nothing her|e"', false); // nothing importable on the left side of a const

          //          1111111111222222222233333333334
          //01234567890123456789012345678901234567890
      test('var wow = "nothing her|e"', false); // nothing importable on the left side of a var


          //          1111111111222222222233333333334
          //01234567890123456789012345678901234567890
      test('export class Te|st extends Nice', 'Test', 13, true); // that's an unlikely one, but this is not that smart...

          //          1111111111222222222233333333334
          //01234567890123456789012345678901234567890
      test('const character = chars.testC|har;', 'chars', 18, false);

          //          1111111111222222222233333333334
          //01234567890123456789012345678901234567890
      test('const a = arr[5] + 9;|', 'arr', 10, true);

          //          1111111111222222222233333333334
          //01234567890123456789012345678901234567890
      test('const a = test.arr[5] + 9;|', 'test', 10, false);

    });

  });

});
