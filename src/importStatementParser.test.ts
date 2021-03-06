import { ImportStatement } from './importStatementParser';
import { Module } from './moduleParser';
import { L } from './common/systemSupport';
import { Project, Projects } from './project';
import * as qt from './common/quickTest';

qt.module( () => {

  async function getImportStatement(code:string):Promise<ImportStatement> {
    let projects = new Projects();
    let project = new Project(projects);
    let module = new Module(project);
    let importStatement = new ImportStatement(module);
    module.sourceCode = code;
    importStatement.token.getNext();
    await importStatement.scan();
    return importStatement;
  }

  async function ioTest(code:string, expected?:string) {
    if (expected == null)
      expected = code;
    let importStatement = await getImportStatement(code);
    qt.testValue(importStatement.isUnderstood).shouldBeTrue;
    qt.testValue(importStatement.asText()).shouldEqual(expected);
    return importStatement;
  };


  qt.test('should not understand dynamic imports', async () => {
    let importStatement = await getImportStatement(`let x = import('dynamic');`);
    qt.testValue(importStatement.isUnderstood).shouldBeFalse;
  } );

  qt.test('should accept a keyword as a symbol alias',async () => { await ioTest(`import { x as as } from 'test';`); });
  qt.test('should accept a keyword as an all alias',async () => {  await ioTest(`import * as as from 'test';`); });

  qt.test('pure symbol import with padding',async () => { await ioTest(`import { symbols_with, padding } from 'test';`); });
  qt.test('pure symbol import without padding', async () => {  await ioTest(`import {symbols, without, padding} from 'test';`); });
  qt.test('pure symbol import with semicolon', async () => {  await ioTest(`import { withSemiColon } from 'test';`); });
  qt.test('pure symbol import without semicolon', async () => {  await ioTest(`import { withOutSemiColon } from 'test'`); });

  qt.test('multiline symbols with 2 space symbol indent', async () => {
    await ioTest( L`
      |import {
      |  MultiLine,
      |  With2SpaceIndent
      |} from 'test';`);
  });

  qt.test('2 space indent with multiline 2 space symbol indent', async () => {
   let importStatement = await getImportStatement(L`
      |  import {
      |    MultiLine,
      |    With2SpaceIndent
      |  } from 'test';`
    );
    qt.testValue(importStatement.asText()).shouldEqual(L`
      |import {
      |    MultiLine,
      |    With2SpaceIndent
      |  } from 'test';`);
    qt.testValue(importStatement.indentCharacters).shouldEqual('  ');
  });

  qt.test('multiline symbols with 4 space indent', async () => {
    await ioTest( L`
      |import {
      |    MultiLine,
      |    With4SpaceIndent
      |} from 'test';`);
  });


  qt.test('cursor position after asText()', async () => {
                                //  (ruler) 111111111122222222223333333333444444444455555555556
                                //0123456789012345678901234567890123456789012345678901234567890
    let stm = await getImportStatement(`import { X as that } from 'whatever'`);
    stm.asText();
    qt.testValue(stm.isUnderstood).shouldBeTrue;
    qt.testValue(stm.cursorPosAfterAsText).shouldEqual(18);
  });

  qt.test('cursor position after asText() vertical', async () => {
     //  (ruler) 111111111122222222223333333333444444444455555555556
     //0123456789012345678901234567890123456789012345678901234567890
    let stm = await getImportStatement( L`
      |import {
      |  one,
      |  two
      |} from 'test';
    `);
    stm.asText();
    qt.testValue(stm.isUnderstood).shouldBeTrue;
    qt.testValue(stm.cursorPosAfterAsText).shouldEqual(21);
  });

  qt.test('merges multiline symbols', async () => {
    let mainStm = await getImportStatement( L`
      |import {
      |  one,
      |  two
      |} from 'test';
    `);
    let newStm = await getImportStatement(`import {three} from 'test'`);
    mainStm.symbols.append(newStm.symbols);
    qt.testValue(mainStm.asText()).shouldEqual(L`
      |import {
      |  one,
      |  two,
      |  three
      |} from 'test';`)
  });

  qt.test('merges multiline symbols and keeps trivia', async () => {
    let mainStm = await getImportStatement( L`
      |import {
      |  one, // one-trivia
      |  two // two-trivia
      |} from 'test';
    `);
    let newStm = await getImportStatement(`import {three} from 'test'`);
    newStm.symbols.items[0].nameTrivia = mainStm.symbols.indentTrivia;
    mainStm.symbols.append(newStm.symbols);
    qt.testValue(mainStm.asText()).shouldEqual(L`
      |import {
      |  one, // one-trivia
      |  two, // two-trivia
      |  three
      |} from 'test';`)
  });


});
