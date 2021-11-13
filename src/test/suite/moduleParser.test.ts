import { expect } from 'chai';
import { it, describe, before } from 'mocha';
import { L } from '../../common/systemSupport';
import { Module } from '../../moduleParser';
import * as ss from '../../common/systemSupport';
import { Project, Projects } from '../../project';

describe('Module Tests', () => {

  const createModule = ():Module => {
    let projects = new Projects();
    let project = new Project(projects);
    return new Module(project);
  }

  let checkNextInsert = (expectedNewlines:number,code:string) => {
    let pos = code.indexOf('|');
    code = code.replace('|','');
    let module = createModule();
    module.sourceCode = code;
    module.scan();
    expect(module.nextImportInsertPos,'nextImportInsertPos').to.equal(pos);
    expect(module.nextImportNewlinesBefore,'nextImportNewlines').to.equal(expectedNewlines);
  }

  it('should find the position of the first and last imports',() =>{
    let module = createModule();
                       //  (ruler) 1 111111111222222 222233333333334 44444444455555555556
                       //01234567890 123456789012345 678901234567890 12345678901234567890
    module.sourceCode = '// comment\nimport "this";\nimport "that";\nlet x = 1;';
    module.scan();
    expect(module.importsStartPos,'importsStartPos').to.equal(11);
    expect(module.importsEndPos,'importsEndPos').to.equal(39);
  });

  it('should be the first line if there are no comments',() =>{
    checkNextInsert(0, L`
      ||
      |
      |let x = 1;
    `);
  });

  it('should put the import position right after the end of the first comments',() =>{
    checkNextInsert(2, L`
      |
      |/* comments */|
      |
      |let x = 1;
    `);
  });

  it('should put the import position end of the last import',() =>{
    checkNextInsert(1, L`
      |
      |import * as ss from 'sys';|
      |
    `);
  });

  it('should put the import position end of any inline comments',() =>{
    checkNextInsert(1, L`
      |
      |/* comments */
      |
      |import * as ss from 'sys'; // watch out|
    `);
  });

  it('adds new indented import into a svelte file', () => {
    let module = createModule();
    module.sourceCode = L`
      |<script>
      |  import { one, two } from 'test';
    `;
    module.isSvelte = true;
    module.scan();
    let s = ss.splice(module.sourceCode, module.nextImportInsertPos, 0, '\n'.repeat(module!.nextImportNewlinesBefore) + module!.importIndentCharacters + `import {three} from 'test';`);
    expect(s).to.equal(L`
      |<script>
      |  import { one, two } from 'test';
      |  import {three} from 'test';
    `);
  });

});
