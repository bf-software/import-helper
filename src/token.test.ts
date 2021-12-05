import { L } from './common/systemSupport';
import { Token } from './token';
import * as qt from './common/quickTest';

qt.module( () => {

  qt.section('basic checks', () => {
    let token:Token;

    qt.beforeThisSection( () => {
      token = new Token();
      token.sourceCode = L`
        |
        |import { x } from 'y';
        |
      `;
      token.getNext()
    });

    qt.test('check state after getting 1st token', () => {
      qt.testValue(token.text).shouldEqual('import');
      qt.testValue(token.startPos).shouldEqual(1);
      qt.testValue(token.endPos).shouldEqual(6);
      qt.testValue(token.startLine).shouldEqual(1);
      qt.testValue(token.startColumn).shouldEqual(0);
      qt.testValue(token.endLocation.line).shouldEqual(1);
      qt.testValue(token.endLocation.column).shouldEqual(5);
    });


  });

});
