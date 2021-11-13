import { expect } from 'chai';
import { it, describe, before } from 'mocha';
import { ImportStatement } from '../../importStatementParser';
import { Module } from '../../moduleParser';
import { L } from '../../common/systemSupport';
import { Project, Projects } from '../../project';

describe('ImportStatement I/O Tests', () => {

  const getImportStatement = (code:string):ImportStatement => {
    let projects = new Projects();
    let project = new Project(projects);
    let module = new Module(project);
    let importStatement = new ImportStatement(module);
    module.sourceCode = code;
    importStatement.token.getNext();
    importStatement.scan();
    return importStatement;
  }

  const ioTest = (code:string, expected?:string) => {
    if (expected == null)
      expected = code;
    let importStatement = getImportStatement(code);
    expect(importStatement.isUnderstood,'import wasn\'t understood').to.be.true;
    expect(importStatement.asText()).to.equal(expected);
    return importStatement;
  };


  it('should not understand dynamic imports', () => {
    let importStatement = getImportStatement(`let x = import('dynamic');`);
    expect(importStatement.isUnderstood,'import was understood').to.be.false;
  } );

  it('should accept a keyword as a symbol alias',() => {  ioTest(`import { x as as } from 'test';`); });
  it('should accept a keyword as an all alias',() => {  ioTest(`import * as as from 'test';`); });

  it('pure symbol import with padding',() => {  ioTest(`import { symbols_with, padding } from 'test';`); });
  it('pure symbol import without padding', () => {  ioTest(`import {symbols, without, padding} from 'test';`); });
  it('pure symbol import with semicolon', () => {  ioTest(`import { withSemiColon } from 'test';`); });
  it('pure symbol import without semicolon', () => {  ioTest(`import { withOutSemiColon } from 'test'`); });

  it('multiline symbols with 2 space symbol indent', () => {
    ioTest( L`
      |import {
      |  MultiLine,
      |  With2SpaceIndent
      |} from 'test';`);
  });

  it('2 space indent with multiline 2 space symbol indent', () => {
   let importStatement = getImportStatement(L`
      |  import {
      |    MultiLine,
      |    With2SpaceIndent
      |  } from 'test';`
    );
    expect(importStatement.asText()).to.equal(L`
      |import {
      |    MultiLine,
      |    With2SpaceIndent
      |  } from 'test';`);
    expect(importStatement.indentCharacters).to.equal('  ');
  });

  it('multiline symbols with 4 space indent', () => {
    ioTest( L`
      |import {
      |    MultiLine,
      |    With4SpaceIndent
      |} from 'test';`);
  });


  it('cursor position after asText()', () => {
                                //  (ruler) 111111111122222222223333333333444444444455555555556
                                //0123456789012345678901234567890123456789012345678901234567890
    let stm = getImportStatement(`import { X as that } from 'whatever'`);
    stm.asText();
    expect(stm.isUnderstood,'import wasn\'t understood').to.be.true;
    expect(stm.cursorPosAfterAsText).to.equal(18);
  });

  it('cursor position after asText()', () => {
     //  (ruler) 111111111122222222223333333333444444444455555555556
     //0123456789012345678901234567890123456789012345678901234567890
    let stm = getImportStatement( L`
      |import {
      |  one,
      |  two
      |} from 'test';
    `);
    stm.asText();
    expect(stm.isUnderstood,'import wasn\'t understood').to.be.true;
    expect(stm.cursorPosAfterAsText).to.equal(21);
  });

  it('merges multiline symbols', () => {
    let mainStm = getImportStatement( L`
      |import {
      |  one,
      |  two
      |} from 'test';
    `);
    let newStm = getImportStatement(`import {three} from 'test'`);
    mainStm.symbols.append(newStm.symbols);
    expect(mainStm.asText()).to.equal(L`
      |import {
      |  one,
      |  two,
      |  three
      |} from 'test';`)
  });

  it('merges multiline symbols and keeps trivia', () => {
    let mainStm = getImportStatement( L`
      |import {
      |  one, // one-trivia
      |  two // two-trivia
      |} from 'test';
    `);
    let newStm = getImportStatement(`import {three} from 'test'`);
    newStm.symbols.items[0].nameTrivia = mainStm.symbols.indentTrivia;
    mainStm.symbols.append(newStm.symbols);
    expect(mainStm.asText()).to.equal(L`
      |import {
      |  one, // one-trivia
      |  two, // two-trivia
      |  three
      |} from 'test';`)
  });


});
