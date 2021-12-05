import * as ss from './systemSupport';
import { L, U } from './systemSupport';
import * as qt from './quickTest';

qt.module( () => {

  qt.section('strings', () => {

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

      qt.testValue(ss.countLines('1')).shouldEqual(1);

      qt.testValue(ss.countLines('')).shouldEqual(0);

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
        await ss.writeFile(file, encoder.encode(testText) );
        let bytes = await ss.readFileBytes(file,15);
        qt.testValue( bytes.toString() ).shouldEqual(testText.substr(0,15));
      });

    });

  });



  qt.section('Event class', () => {

    qt.test('using return', () => {
      let onEvent = new ss.Event<string,string>();
      onEvent.do((s)=>{
        return s+'!';
      });
      qt.testValue( onEvent.cue('hi') ).shouldEqual('hi!');
    });

    qt.test('using e.result', () => {
      let onEvent = new ss.Event<string,string>();
      onEvent.do((s, e)=>{
        e.result = s+'!';
      });
      qt.testValue( onEvent.cue('hi') ).shouldEqual('hi!');
    });

    qt.test('multiple listeners', () => {
      let onEvent = new ss.Event<string,string>();
      onEvent.do((s, e)=>{
        e.result += '!';
      });
        onEvent.do((s, e)=>{
        e.result += '?';
      });
      qt.testValue( onEvent.cue('hi','wow') ).shouldEqual('wow!?');
    });

    qt.test('multiple listeners, with stop', () => {
      let onEvent = new ss.Event<string,string>();
      onEvent.do((s, e)=>{
        e.result += '!';
        e.stopCues();
      });
        onEvent.do((s, e)=>{
        e.result += '?';
      });
      qt.testValue( onEvent.cue('hi','wow') ).shouldEqual('wow!');
    });

    qt.test('multiple listeners, with cancel', () => {
      let onEvent = new ss.Event<string,string>();
      onEvent.do((s, e)=>{
        e.result += '!';
      });
        onEvent.do((s, e)=>{
        e.result += '?';
        e.cancelEvent();
      });
      qt.testValue( onEvent.cue('hi','wow') ).shouldEqual('wow');
    });

    qt.test('multiple asynchronous listeners (no await)', () => {
      let onEvent = new ss.Event<string,string>();
      onEvent.do(async (s, e)=>{
        await ss.sleep(100);
        e.result += '!';
      });
        onEvent.do(async (s, e)=>{
        await ss.sleep(100);
        e.result += '?';
      });
      qt.testValue( onEvent.cue('hi','wow') ).shouldEqual('wow');
    });

    qt.test('multiple real asynchronous listeners (with await)', async () => {
      let onEvent = new ss.AsyncEvent<string,string>();
      onEvent.do(async (s, e)=>{
        await ss.sleep(100);
        e.result += '!';
      });
        onEvent.do(async (s, e)=>{
        await ss.sleep(100);
        e.result += '?';
      });
      qt.testValue( await onEvent.cue('hi','wow') ).shouldEqual('wow!?');
    });


  });

});