import * as qt from './common/quickTest';
import * as ss from './common/systemSupport';

import './common/systemSupport.test';
import './common/collectionSupport.test';
import './common/quickTest.test';

import './moduleParser.test';
import './importStatementParser.test';
import './token.test';


export async function run(): Promise<void> {

  console.log(`\n\nwaiting for vscode's internal uncaught errors to finish displaying...\n\n`);
  await ss.sleep(1000);

  await qt.start({
    outputToConsole:true, // <-- vscode will not capture stdout, so we have to force output to the console. (at least in Windows)
  });

}

