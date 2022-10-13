/**
 * adds features to the default error handling system.  This includes the ability to map the
 * error stack to original source files using .map files.  It also makes the stack appear
 * in messages as a more friendly call tree, for example:
 * ```
 * main.ts:12:3
 * ⮡ collectionSupport.ts:5:14
 *   ⮡ systemSupport.ts:2:88
 * ```
 * instead of:
 * ```
 * at systemSupport.ts:2:88
 * at collectionSupport.ts:5:14
 * at main.ts:12:3
 * ```
 *
 * for all exceptions, this will convert node's test based error stack to a js object that can be easilly read later if needed.
 *
 * for unhandled exceptions, this will convert the stack's files to their mapped file if applicable, then it will output the stack
 * to the console in a friendly manor.
 *
 * call {@link initEntryPoint()} from the first line of the module you consider to be the entrypoint of your application.
 */

import * as cs from './collectionSupport';
import { L } from './systemSupport';
import { SourceMapConsumer } from 'source-map-js';
import * as fs from 'fs';
import * as ss from './systemSupport';
import * as nodePath from 'path';
import * as url from 'url';
import * as ns from './nodeSupport';

interface OriginalLocation {
  file: string,
  line: number,
  column: number
}

export interface StackItem {
  file:string,
  line:number,
  column:number,
  className?:string,
  functionName?:string,
  methodName?:string,
  originalLocation?:OriginalLocation
}

interface ESError extends Error {
  unmappedStack: cs.FfArray<StackItem>;
}

export function resolveFromProjectPath(file: string) {
  return ns.getRelativePath(ss.ifBlank(settings.projectRootPath, settings.entryPointPath) , file);
}

export class ErrorSettings {
  /**
   * include bootstrap code in error stacks.  The bootstrap code is everything above the entry point of the project.
   */
  public showBootstrapStack = false;
  public entryPointFile = ns.getEntryPointFile();
  public postBootstrapEntryPointFile = '';
  public get entryPointPath():string {
    return ss.extractPath(this.entryPointFile);
  }
  /**
   * path to the root of the project.  This will become the base to all relative file paths in error
   * stacks. Vscode bases relative paths on the main open folder when opening files with
   * click-to-open in the debug console. This may need to be set to get vscode to open your code
   * files properly.
   */
  public projectRootPath = '';
}

export interface InitEntryPointOptions {
  /**
   * indicates the number of levels ("callers") above the line in the code this initEntryPoint() was
   * placed in that should be considered the entry point module. If this is not specified, it's
   * assumed to be 0, which means the actual module that called initEntryPoint().  If you set this as
   * 1, then the entry point would be whatever module called the module, that called
   * initEntryPoint(), etc.
   */
  levelsAbove?:number,

  /**
    if errorSupport.ts is producing relative links in it's stack trace that vscode can't find when you click on them, try setting this option.

    vscode uses it's open project folder as the root of clickable relative paths in the debug console.  Set this to a relative path that
    takes you from the path of your running application's entry point, to the open folder in vscode. For example, if you have this
    structure:
    ```
    /myProjects
      /myApp
        /out
          hello.js
          hello.js.map
        /src
          hello.ts
    ```
    if you have /myProjects/myApp open in vscode, then make this call in hello.ts:
      `errorSupport.initEntryPoint({relativePathFromScriptToVSCodeFolder:'../'})`
  */
  relativePathFromScriptToVSCodeFolder?:string
}

/**
 * this should be called on the first line of code in the entry point of the project.  If you don't call this,
 * by default, the entry point will be inferred from `process.mainModule.filename` or `import.meta.uri`.
 * However, those calls are somewhat brittle because the data returned by them change depending on how
 * your project was launched. Calling `initEntryPoint()` is always recommended because it's a more definitive
 * way of letting errorSupport.ts figure out the entry point module.
 *
 * If you have an app that has a lot of bootstrap code, calling this from the module you consider to be the
 * real entry point will cause bootstrap code to be omitted from error stack traces.  Usually the bootstrap
 * code is not helpful and just adds clutter to already difficult to read stack traces.
 */
export function initEntryPoint(options?:InitEntryPointOptions) {
  let levelsAbove = options?.levelsAbove ?? 0;
  let item:StackItem | undefined;
  if (typeof options?.relativePathFromScriptToVSCodeFolder == 'string') {
    settings.projectRootPath = ss.extractPath(ns.getEntryPointFile());
    settings.projectRootPath = ns.resolvePath(settings.projectRootPath, options.relativePathFromScriptToVSCodeFolder);
  }
  if (!item || levelsAbove > 0)
    item = getCallerLocation(levelsAbove+2);
  if (!item)
    throw Error('errorSupport: initEntryPoint() could not determine the entry point file for the project.');
  settings.entryPointFile = item.file;
  settings.postBootstrapEntryPointFile = item.originalLocation?.file ?? item.file;
}

export interface StackFormatOptions {
  startFunc?:(item:StackItem) => boolean;
  filterFunc?:(item:StackItem) => boolean;
  stopFunc?:(item:StackItem) => boolean;
  showBootstrapStack?:boolean;
}

class SourceLocator {
  private smc:SourceMapConsumer|undefined;
  public isValid = false;

  constructor (
    public file:string
  ) {
    let mapFile = file + '.map';
    if (ns.fileExistsSync(mapFile)) {
      let rawSourceMap = JSON.parse(fs.readFileSync(mapFile, {encoding: 'utf8'} ) );
      this.smc = new SourceMapConsumer(rawSourceMap)
      this.isValid = true;
    }
  }

  public get filePath():string {
    return ss.extractPath(this.file);
  }

  public getOriginalLocation(line:number,column:number):OriginalLocation|undefined {
    let originalPosition = this.smc!.originalPositionFor({line,column});
    if (typeof originalPosition.source == 'string'){
      return {
        file: ns.resolveFile(this.filePath, originalPosition.source),
        line: originalPosition.line,
        column: originalPosition.column
      }
    }
    return undefined;
  }

}

/**
 * the key is the source file, and the value is the SourceLocator
 */
let sourceLocators = new cs.FfMap<string,SourceLocator>();

/**
 * returns the function name in the following format: `ClassName.functionName()`
 *
 */
export function getFunctionName(item:StackItem) {
  return ss.concatWS('.',item.className, ss.suffix(item.functionName ?? '','()') );
}

export function getCodeFile(item:StackItem): string {
  return (item.originalLocation ? item.originalLocation.file : item.file);
}

export function getCodeLineColumn(item:StackItem): string {
  let line = (item.originalLocation ? item.originalLocation.line : item.line);
  let column = (item.originalLocation ? item.originalLocation.column : item.column);
  return `${line}:${column}`;
}

/**
 * returns a string containing the **relative** path from `settings.projectRootPath` to the module file
 * plus the line and column numbers, ex: `./src/myProject/myModule.ts:10:15`
 */
export function getCodeLocation(codeFile:string, codeLineColumn:string):string;
export function getCodeLocation(item:StackItem):string;
export function getCodeLocation(itemOrCodeFile:StackItem|string, codeLineColumn:string = ''):string {
  let codeFile:string;
  if (typeof itemOrCodeFile == 'object') {
    let item = itemOrCodeFile;
    codeFile = getCodeFile(item);
    codeLineColumn = getCodeLineColumn(item);
  } else
    codeFile = itemOrCodeFile;
  if (ss.isAbsolutePath(codeFile))
    codeFile = resolveFromProjectPath(codeFile);
  return `${codeFile}:${codeLineColumn}`;
}

/**
 * returns each line of a stack trace as a `call tree` where the top represents the root and
 * additional lines represent the leaves.  This is the opposite direction compared to the common way
 * of formatting stacks, that is, the caller is listed first, then the callee is listed below that
 * and so on. ex.
 * ```
 * /node_modules/node/nodeBoostrapCode.js:5:21    something()
 * ⮡  /node_modules/node/nodeBoostrapCode.js:10:242  ⮡  anotherSomething()
 *  ⮡  /src/yourEntryPoint.ts                         ⮡  yourMain()
 *   ⮡  /src/yourLibrary.ts                            ⮡  yourFunction()
 *    ⮡   /node_modules/someThirdPartyLibrary.js        ⮡  thirdPartyFunction()
 *     ⮡   /node_modules/anotherThirdPartyLibrary.js     ⮡  anotherThirdPartyFunction()
 *
 * the first line of the stack represents the entry point into the app. Subequent lines indicate
 * additional calls in the call tree.  The last line represents the final call in the call
 * tree--usually the one that actually threw the error.
 *
 * the file names are uniformly indented, with each subequent line becoming indented by one
 * character.
 *
 * the function calls are also indented the same way as long as the line above allows it.  If the
 * file path of the line above is very long, the indent of the function call will be pushed outward
 * so that subsequent functions are never indented less then the calling function.
 *
 * note that in any call stack there are items that are of little interest to the developer. Usually the
 * "bootstrap" code shows internal junk that the developer has no control over.  Additionally, the
 * particulars about errors thrown inside third party libraries may not be all that useful. Use the
 * `options` parameter to control what is shown in the formatted stack.
 *
 * @param errorStack a stack preformatted by getMappedStack().  Stack arrays are always in reverse
 * call order -- which is the way javascript creates them. i.e., with the last call on top of the
 * stack and the first call on the bottom. (The opposite of the format order.)
 *
 * @param options a list of options that control where the error stack starts and ends, and provides
 * the ability to filter the stack.
 *
 */
export function formatErrorStack(errorStack:cs.FfArray<StackItem>, options?:StackFormatOptions):string {
  options = options ?? {};
  options.showBootstrapStack = options?.showBootstrapStack ?? settings.showBootstrapStack;
  let found = errorStack.last;

  let result = '';

  if (options?.startFunc) {
    let startFound = errorStack.byFuncReverse( options.startFunc );
    if (startFound)
      found = startFound;
  } else if (!options.showBootstrapStack) {
    if (settings.postBootstrapEntryPointFile == '')
      result += '{showing bootstrap code in stack -- use initEntryPoint() to hide}\n';
    let startFound = errorStack.byFuncReverse( (item) => (item.originalLocation?.file ?? item.file) == settings.postBootstrapEntryPointFile );
    if (startFound)
      found = startFound;
  }

  let lastFunctionStart = 0;
  let line = 0;
  if (found) {
    for (let i=found.index; i >= 0; i--) {
      let item = errorStack[i];
      if (options?.filterFunc)
        if (!options.filterFunc(item))
          continue;

      if (options?.stopFunc)
        if (!options.stopFunc(item))
          break;

      let resultLine = '';
      if (line > 0)
        resultLine += ' '.repeat(line-1) + '⮡ ';
      resultLine += getCodeLocation(item);

      if (line == 0) {
        resultLine += '    ';
        lastFunctionStart = resultLine.length-2;
      } else {
        let indent = (lastFunctionStart - resultLine.length);
        if (indent > 0) {
          resultLine += ' '.repeat(indent+1);
        }
        lastFunctionStart = resultLine.length;
        resultLine += ' ⮡ ';
      }
      resultLine += getFunctionName(item);

      result += resultLine + '\n';

      line++;
    }
  }

  // note: sometimes you just won't get a call stack in node.  Especially for asynchronous `fs` functions.
  // see: https://github.com/nodejs/node/issues/30944
  if (result == '')
    result = `<no error stack>${errorStack.length ? ' (actual error stack had items, but was filtered)' : ''}\n`;

  return result;
}

function getOriginalLocation(item:StackItem):OriginalLocation|undefined {
  let foundSourceLocator = sourceLocators.byKey(item.file);
  if (foundSourceLocator)
    return foundSourceLocator.value.getOriginalLocation(item.line,item.column);
  let sourceLocator = new SourceLocator(item.file);
  if (sourceLocator.isValid) {
    sourceLocators.set(item.file, sourceLocator);
    return sourceLocator.getOriginalLocation(item.line,item.column);
  }
}

export function getMappedStack(unmappedStack:cs.FfArray<StackItem>|undefined):cs.FfArray<StackItem> | undefined {
  if (!unmappedStack || unmappedStack.length == 0)
    return undefined;

  let mappedStack = new cs.FfArray<StackItem>();
  for (let item of unmappedStack) {
    let mappedItem:Partial<StackItem> = {};
    Object.assign(mappedItem, item)
    mappedItem.originalLocation = getOriginalLocation(item);
    mappedStack.push(mappedItem as StackItem);
  }
  return mappedStack;
}

export function getCallerLocationByFunc(func:(item:StackItem) => boolean):StackItem|undefined {
try {
    throw new Error()
  } catch (e:unknown) {
    if (e instanceof Error) {

      /**
       * the following unused assignment is important, because `prepareStackTrace` only gets called (and therefore an
       * Error.unmappedStack gets created) if e.stack is referenced.
       */
      let stack = e.stack;
      let mappedStack = getMappedStack((e as any).unmappedStack);
      if (mappedStack) {
        let foundItem = mappedStack?.byFunc(func);
        if (foundItem)
          return foundItem.value;
      }
    }
  }
}

/**
 * gets the code location that called your function.
 * ```
 * ```
 * if this is the contents of this module: myModule.ts
 * ```txt
 * 1 |function whereIsThisCall():string {
 * 2 |  let {originalLocation} = es.getCallerLocation();
 * 3 |  return `
 * 4 |    The place in the code that called whereIsThisCall() is located here:
 * 5 |    file: ${originalLocation.file} at line: ${originalLocation.line}`
 * 6 |  `;
 * 7 |}
 * 8 |
 * 9 |console.log(whereIsThisCall());
 * ```
 * then this will output:
 * ```txt
 *     The place in the code that called whereIsThisCall() is located here:
 *     file: ./src/myModule.ts at line: 9
 * ```
 * however, if you need the parent caller location, pass the number 1 to get the
 * caller's caller, and 2 to get the caller's caller's caller, and so on.
 */
export function getCallerLocation(parentCallerLevel:number = 0):StackItem|undefined {
  try {
    throw new Error()
  } catch (e:unknown) {
    if (e instanceof Error) {


      // the following unused assignment is important, because `prepareStackTrace` only gets called (and therefore an
      // Error.unmappedStack gets created) if e.stack is referenced.
      let stack = e.stack;

      let mappedStack = getMappedStack((e as any).unmappedStack);

      // we skip mappedStack[0] because it represents the `throw new Error()` line in the try of this function,
      // mappedStack[1] would be the caller location
      // mappedStack[2] gets us the location of the caller that called the caller (the parent caller)
      // mappedStack[3] would be the location that called that, etc.
      let itemIndex = 1 + parentCallerLevel;

      return (mappedStack ?? [])[itemIndex];
    }
  }
}

export function getFullErrorMessage(e: any, options?:StackFormatOptions) {

  if (! (e instanceof Error)) {
    let result = L`
      [Error Type: ${typeof e}]
      ${String(e)}
    `
    return result;
  }

 /**
   * the following unused assignment is important, because `prepareStackTrace` only gets called if e.stack is
   * referenced. Node doesn't reference it if `on('uncaughtException'...` is used, however electron does (so this
   * is here for node only.)
   */
  if (typeof (e as any).unmappedStack != 'object') {
    let stack = e.stack;
  }

  let result = L`
    [${e.name}]
    ${e.message}
  `;

  let mappedStack = getMappedStack((e as ESError).unmappedStack);
  if (mappedStack)
    result += formatErrorStack(mappedStack, options);
  else
    result += formatErrorStack((e as ESError).unmappedStack, options);

  return result;
}

// Initialization -------------------------------------------------------------------------------------------------


// Note: in node, this completely replaces the default unhandled exception.  However, in electron, this only stops
// the popup window, the console will still get a default error stack dump.  We take care of suppressing the
// electron dump by removing the error stack entirely from the thrown exception, and instead keep it in our
// own `unmappedStack` variable.
process.on('uncaughtException', (e) => {
  console.log('↓ uncaught exception ↓');
  console.log(getFullErrorMessage(e))
});

process.on('unhandledRejection', (reason, promise) => {
  console.log('↓ unhandled rejection ↓');
  if (reason instanceof Error)
    console.log(getFullErrorMessage(reason));
  else
    console.log(reason);
});

Error.prepareStackTrace = (error, structuredStackTrace) => {

  (error as ESError).unmappedStack = new cs.FfArray<StackItem>();

  for (let item of structuredStackTrace) {
    let file = item.getFileName();
    let line = item.getLineNumber();
    let column = item.getColumnNumber();

    if (typeof file == 'string' && typeof line == 'number' && typeof column == 'number') {
      if (ss.startsWith(file,'file://'))
        file = url.fileURLToPath(file);
      file = ss.internalizeFile(file);
      (error as ESError).unmappedStack.push( {
        file,
        line,
        column,
        className: item.getTypeName() ?? undefined,
        functionName: item.getFunctionName() ?? undefined,
        methodName: item.getMethodName() ?? undefined
      });
    }
  };

  // hide the stack so that unhandled exceptions won't dump it to the console in electron.
  // (`process.on('uncaughtException'` will suppress that in node, but not electron.)
  return getFullErrorMessage(error);
}


export let settings = new ErrorSettings();
