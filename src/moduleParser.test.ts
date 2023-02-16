import { L } from './common/systemSupport';
import { Module } from './moduleParser';
import * as ss from './common/systemSupport';
import { Project, Projects } from './project';
import * as qt from './common/quickTest';

qt.module( () => {

  function createModule():Module {
    let projects = new Projects();
    let project = new Project(projects);
    return new Module(project);
  }

  async function checkNextInsert(expectedNewlines:number,code:string) {
    let pos = code.indexOf('|');
    code = code.replace('|','');
    let module = createModule();
    module.sourceCode = code;
    await module.scan();
    let importSection = module.selectedImportSection;
    qt.testValue(importSection.nextImportInsertPos).shouldEqual(pos);
    qt.testValue(importSection.nextImportNewlinesBefore).shouldEqual(expectedNewlines);
  }

  qt.test('find the position of the first and last imports', async () =>{
    let module = createModule();
                       //  (ruler) 1 111111111222222 222233333333334 44444444455555555556
                       //01234567890 123456789012345 678901234567890 12345678901234567890
    module.sourceCode = '// comment\nimport "this";\nimport "that";\nlet x = 1;';
    await module.scan();
    let importSection = module.selectedImportSection;
    qt.testValue(importSection.importsStartPos).shouldEqual(11);
    qt.testValue(importSection.importsEndPos).shouldEqual(39);
  });

  qt.test('should be the first line if there are no comments', async () =>{
    checkNextInsert(0, L`
      ||
      |
      |let x = 1;
    `);
  });

  qt.test('should put the import position right after the end of the first comments',() =>{
    checkNextInsert(2, L`
      |
      |/* comments */|
      |
      |let x = 1;
    `);
  });

  qt.test('should put the import position end of the last import',() =>{
    checkNextInsert(1, L`
      |
      |import * as ss from 'sys';|
      |
    `);
  });

  qt.test('should put the import position end of any inline comments',() =>{
    checkNextInsert(1, L`
      |
      |/* comments */
      |
      |import * as ss from 'sys'; // watch out|
    `);
  });

  qt.test('adds new indented import into a svelte file', async () => {
    let module = createModule();
    module.sourceCode = L`
      |<script>
      |  import { one, two } from 'test';
    `;
    module.isSvelte = true;
    module.currentCursorPos = 0;
    await module.scan();
    let importSection = module.selectedImportSection;
    let s = ss.splice(module.sourceCode, importSection.nextImportInsertPos, 0, '\n'.repeat(importSection.nextImportNewlinesBefore) + importSection.importIndentCharacters + `import { three } from 'test2';`);    qt.testValue(s).shouldEqual(L`
      |<script>
      |  import { one, two } from 'test';
      |  import { three } from 'test2';
    `);
  });

  qt.test('adds new indented import to the upper script tag', async () => {
    let module = createModule();
    module.sourceCode = L`
      <script context="module">
        import { one, two } from 'test';
      </script>|

      <script>
        import { a, b } from 'test';
      </script>
    `;
    module.isSvelte = true;
    module.currentCursorPos = module.sourceCode.indexOf('|');
    module.sourceCode = ss.splice(module.sourceCode, module.currentCursorPos,1,'');
    await module.scan();
    let importSection = module.selectedImportSection;
    let s = ss.splice(module.sourceCode, importSection.nextImportInsertPos, 0, '\n'.repeat(importSection.nextImportNewlinesBefore) + importSection.importIndentCharacters + `import { three } from 'test2';`);
    qt.testValue(s).shouldEqual(L`
      <script context="module">
        import { one, two } from 'test';
        import { three } from 'test2';
      </script>

      <script>
        import { a, b } from 'test';
      </script>
    `);
  });



  qt.test('adds new indented import to the lower script tag', async () => {
    let module = createModule();
    module.sourceCode = L`
      <script context="module">
        import { one, two } from 'test';
      </script>

      <script>
        import { a, b } from 'test';|
      </script>
    `;
    module.isSvelte = true;
    module.currentCursorPos = module.sourceCode.indexOf('|');
    module.sourceCode = ss.splice(module.sourceCode, module.currentCursorPos,1,'');
    await module.scan();
    let importSection = module.selectedImportSection;
    let s = ss.splice(
      module.sourceCode,
      importSection.nextImportInsertPos,
      0,
      '\n'.repeat(importSection.nextImportNewlinesBefore) +
        importSection.importIndentCharacters +
        `import { three } from 'test2';`
    );
    qt.testValue(s).shouldEqual(L`
      <script context="module">
        import { one, two } from 'test';
      </script>

      <script>
        import { a, b } from 'test';
        import { three } from 'test2';
      </script>
    `);
  });

});
