import { expect } from 'chai';
import { it, describe, before } from 'mocha';
import { L } from '../../common/systemSupport';
import { Token } from '../../token';

describe('token tests', () => {

  describe('basic checks', () => {
    let token = new Token();
    token.sourceCode = L`
      |
      |import { x } from 'y';
      |
    `;
    token.getNext()
    it('should be in this state:', () => {
      expect(1,'text').to.equal(1);
      expect(token.text,'text').to.equal('import');
      expect(token.startPos,'startPos').to.equal(1);
      expect(token.endPos,'endPos').to.equal(6);
      expect(token.startLine,'startLine').to.equal(1);
      expect(token.startColumn,'startColumn').to.equal(0);
      expect(token.endLocation.line,'endLocation.line').to.equal(1);
      expect(token.endLocation.column,'endLocation.column').to.equal(5);
    });


  });

});
