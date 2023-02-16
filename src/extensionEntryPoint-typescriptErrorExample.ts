/*

  not sure why simply using the 'typescript' library causes this error to appear in the log when running the extension:

  Could not read source map for file:///D:/MyData/Pro/Node/import-helper/node_modules/typescript/lib/typescript.js: ENOENT: no such file or directory, open 'd:\MyData\Pro\Node\import-helper\node_modules\typescript\lib\typescript.js.map

 */

import ts from 'typescript';

console.log('Using typescript: ' + ts.ClassificationTypeNames);
