import * as ss from './systemSupport';
import { L, U } from './systemSupport';
import * as qt from './quickTest';
import * as ns from './nodeSupport';

qt.module( () => {

  qt.section('strings', () => {

    qt.section('indexToCoorinates()', () => {
      qt.test('simple', () => {
        // 0123456789
        let s = L`
          |line one
          |line two
          |line 3
        `;
        let c = ss.positionToLineColumn(s,0);
        qt.testValue(c).shouldDeepEqual({line: 0, column: 0});
        c = ss.positionToLineColumn(s,7);
        qt.testValue(c).shouldDeepEqual({line: 0, column: 7});
        c = ss.positionToLineColumn(s,9);
        qt.testValue(c).shouldDeepEqual({line: 1, column: 0});
        c = ss.positionToLineColumn(s,18);
        qt.testValue(c).shouldDeepEqual({line: 2, column: 0});
        c = ss.positionToLineColumn(s,19);
        qt.testValue(c).shouldDeepEqual({line: 2, column: 1});
      });
    });


    qt.section('strToLines()', () => {

      qt.test('multi line with last line having no newline', () => {
        qt.testValue(ss.indent('{\n  one line\n}',5)).shouldEqual(L`
          |     {
          |       one line
          |     }`);
      });

      qt.test('one line', async () => {
        qt.testValue(ss.indent('one line',5)).shouldEqual('     one line');
        qt.testValue(ss.indent('one line\n',5)).shouldEqual('     one line\n');
      });

      qt.test('two simple lines with newlines', () => {

        qt.testValue(ss.indent(L`
          |line one
          |line two
        `,5)
        ).shouldEqual(L`
          |     line one
          |     line two
        `);
      });

      qt.test('two lines with many newlines', () => {
        qt.testValue(ss.indent('\n\nline one\n\nline two\nthird line\n\n\n',5)
        ).shouldEqual(L`
          |
          |
          |     line one
          |
          |     line two
          |     third line
          |
          |
        `);
      });

    });


    qt.section('lineUpWithCode()', () => {

      qt.test('one line', () => {
        qt.testValue(L`
          test
        `).shouldEqual('test\n');
      });

      qt.test('two lines', () => {
        qt.testValue(L`
          two
          lines
        `).shouldEqual('two\nlines\n');
      });

      qt.test('trailing blank lines', () => {
        qt.testValue(L`
          two
          lines
        `).shouldEqual('two\nlines\n');
      });

      qt.test('without final newline', () => {
        qt.testValue(L`
          two
          lines`).shouldEqual('two\nlines');
      });

      qt.test('two lines with indent', () => {
        qt.testValue(L`
          two
            lines
        `).shouldEqual('two\n  lines\n');
      });

      qt.test('should handle two lines with reverse indent', () => {
        qt.testValue( L`
            two
          lines
        `).shouldEqual('  two\nlines\n');
      });

      qt.test('should handle two lines with pipes', () => {
        qt.testValue( L`
          |  two
          |  lines
        `).shouldEqual('  two\n  lines\n');
      });

      qt.test('a newline at the top', () => {
        qt.testValue( L`

          a single newline should be before this text, and one after
        `).shouldEqual('\na single newline should be before this text, and one after\n');
      });

      qt.test('two newlines at the top', () => {
        qt.testValue( L`


          two newlines should be before this text, and one after
        `).shouldEqual('\n\ntwo newlines should be before this text, and one after\n');
      });

      qt.test('should not trim newlines that are supposed to be there', () => {
        qt.testValue( L`
          |
          |a newline should be before and after
          |
        `).shouldEqual('\na newline should be before and after\n\n');
      });

      qt.test('should keep all middle newlines intact', () => {
        qt.testValue( L`
          there should be three newlines after this


          and one after this
        `).shouldEqual('there should be three newlines after this\n\n\nand one after this\n');
      });

      qt.test('tried to trick the algorithm with slashes', () => {
        qt.testValue( L`
          \\ohh ${'yea'}\\
          \\$ haha!
          \${}
        `).shouldEqual(
          '\\ohh yea\\\n'+
          '\\$ haha!\n'+
          '${}\n'
         );
      });

      qt.test('tried to trick the algorithm with pipes', () => {
        qt.testValue( L`
          | ||ohh ${'yea'}||
            |haha!|
        `).shouldEqual(
          ' ||ohh yea||\n'+
          ' |haha!|\n'
         );
      });

    });

    qt.section('lineUpWithCode(`${withParams}`)', () => {

      qt.test('simple param replacement', () => {
        qt.testValue( L`
          ${'hi'}
          ${'there'}
        `).shouldEqual('hi\nthere\n');
      });

      qt.test('was accidentally trimming params!', () => {
        qt.testValue( L`
          ${'ok:'} ${'this should line up:'} ${'with this'}
          ${'ok:'} ${'short text:         '} ${'with this'}
        `).shouldEqual(
          'ok: this should line up: with this\n'+
          'ok: short text:          with this\n'
        );
      });

      qt.test('multiline params', () => {
        let multiline = L`
          <this>
            <is>
          <multiline>
        `;
        qt.testValue( L`
          <multiline params>
            ${multiline}
          <are indented too!>
        `).shouldEqual('<multiline params>\n  <this>\n    <is>\n  <multiline>\n<are indented too!>\n');
      });

      qt.test('sloppy multiline params', () => {
        let multiline = L`
          <two>
          <lines>
        `;
        qt.testValue( L`
          <sloppy>${multiline}<code>
        `).shouldEqual('<sloppy><two>\n<lines>\n<code>\n');
      });

    });

    qt.section('URL template tag: U``', () => {

      qt.test('should handle one line', () => {
        qt.testValue( U`
          https://test.com?
            param1=${"cool"}&
            param2=${"& it works!"}
        `).shouldEqual('https://test.com?param1=cool&param2=%26%20it%20works!');
      });

    });

    qt.test('countLines()', () => {

      qt.testValue(ss.countLines(`1
      2
      3
      `)).shouldEqual(4);

      qt.testValue(ss.countLines(`1
      2
      3`)).shouldEqual(3);

      qt.testValue(ss.countLines(`1
      `)).shouldEqual(2);

      qt.testValue(ss.countLines('1')).shouldEqual(1);

      qt.testValue(ss.countLines('')).shouldEqual(1);

    });

    qt.test('formatCsvValue()', () => {

      qt.testValue(ss.formatCsvValue(`test`)).shouldEqual('test');

      qt.testValue(ss.formatCsvValue(L`
        1
        2
        3
      `)).shouldEqual('"1\n2\n3\n"');

      qt.testValue(ss.formatCsvValue(`Jimmy "Jimbo" Jones`)).shouldEqual('"Jimmy ""Jimbo"" Jones"');

      qt.testValue(ss.formatCsvValue(`one, two, three`)).shouldEqual('"one, two, three"');

    });

  });




  qt.section('files', () => {

    qt.test('file and path manipulation', () => {
      qt.testValue(ss.extractFileName('/home/test.txt')).shouldEqual('test.txt');
      qt.testValue(ss.extractFileName('/home/')).shouldEqual('');
      qt.testValue(ss.extractFileName('/')).shouldEqual('');
      qt.testValue(ss.extractFileName('')).shouldEqual('');
      qt.testValue(ss.extractFileName('c:/')).shouldEqual('');

      qt.testValue(ss.extractFolderName('c:/wow/')).shouldEqual('wow');
      qt.testValue(ss.extractFolderName('c:/')).shouldEqual('');
      qt.testValue(ss.extractFolderName('/')).shouldEqual('');
      qt.testValue(ss.extractFolderName('')).shouldEqual('');

      qt.testValue(ss.extractPath('c:/wow/nice.txt')).shouldEqual('c:/wow/');
      qt.testValue(ss.extractPath('/test.tst')).shouldEqual('/');
      qt.testValue(ss.extractPath('nope')).shouldEqual('');
      qt.testValue(ss.extractPath('../cool.txt')).shouldEqual('../');
      qt.testValue(ss.extractPath('../')).shouldEqual('');
      qt.testValue(ss.extractPath('/home/wow/')).shouldEqual('/home/');
      qt.testValue(ss.extractPath('/home/wow')).shouldEqual('/home/');
    });

    qt.section('readFileBytes()', () => {

      qt.test('should read the bytes', async () => {
        let file = qt.globals.stagingPath+'/readFileBytes.txt';
        let encoder = new TextEncoder();
        let testText = 'This is a test\x00this is not part of the test.';
        await ns.writeFile(file, encoder.encode(testText) );
        let bytes = await ns.readFileBytes(file,15);
        qt.testValue( bytes.toString() ).shouldEqual(testText.substr(0,15));
      });

    });

  });




  qt.section('math', async () => {
    qt.test('wrapNumber', async () => {
      qt.testValue( ss.wrapNumber(1, 1, 10) ).shouldEqual(1);
      qt.testValue( ss.wrapNumber(5, 1, 10) ).shouldEqual(5);
      qt.testValue( ss.wrapNumber(10, 1, 10) ).shouldEqual(10);
      qt.testValue( ss.wrapNumber(11, 1, 10) ).shouldEqual(1);
      qt.testValue( ss.wrapNumber(15, 1, 10) ).shouldEqual(5);
      qt.testValue( ss.wrapNumber(7, 0, 6) ).shouldEqual(0);
      qt.testValue( ss.wrapNumber(-2, 0, 6) ).shouldEqual(5);
      qt.testValue( ss.wrapNumber(12, 1, 5) ).shouldEqual(2); // because 6=1, 10=5, 11=1, 12=2,
    });
  });



});
