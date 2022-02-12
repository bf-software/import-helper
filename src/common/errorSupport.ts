/**
 * adds features to the default error handling system.  This includes the ability to map the
 * error stack to original source files isong .map files.  It also makes the stack appear
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
   * path to the root of the project.  This will become the base to all relative file paths in error stacks.
   * Vscode bases relative paths on the main open folder when opening files with click-to-open in the debug console.
   * This may need to be set to get vscode to open your code files properly.
   */
  public projectRootPath = '';
}

export interface InitEntryPointOptions {
  /**
    indicates the number of levels ("callers") above the line in the code this initEntryPoint() was placed in should be considered the entry point module.
    If this is not specified, it's assumed to be 1, which means the actual module that called initEntryPoint().  If you set this as 2, then the entry point
    would be whatever module called the module, that called initEntryPoint(). etc.
  */
  levelsAbove?:number,
  /**
    if errorSupport.ts is producing relative links in it's stack trace that vscode can't find when you click on them, try setting this option.

    vscode uses it's open project folder as the root of clickable relative paths in the debug console.  Set this to a relative path that
    takes you from the path of your running application's entry point, to the open folder in vscode. For example, if you have this
    structure:

    /myProjects
      /myApp
        /out
          hello.js
          hello.js.map
        /src
          hello.ts

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
  let levelsAbove = options?.levelsAbove ?? 1;
  let item:StackItem | undefined;
  if (typeof options?.relativePathFromScriptToVSCodeFolder == 'string') {
    item = getCallerLocation();
    if (item)
      settings.projectRootPath = ns.resolvePath( ss.extractPath(item.originalLocation?.file ?? item.file), options.relativePathFromScriptToVSCodeFolder);
  }
  if (!item || levelsAbove > 1)
    item = getCallerLocation(levelsAbove);
  if (!item)
    throw Error('errorSupport: initEntryPoint() could not determine the entry point file for the project.');
  settings.entryPointFile = item.file;
  settings.postBootstrapEntryPointFile = item.originalLocation?.file ?? item.file;
}

export interface StackFormatOptions {
  startFunc?:(item:StackItem) => boolean;
  filterFunc?:(item:StackItem) => boolean;
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

export function formatStackItem(item:StackItem) {
  let file = (item.originalLocation ? item.originalLocation.file : item.file);
  let line = (item.originalLocation ? item.originalLocation.line : item.line);
  let column = (item.originalLocation ? item.originalLocation.column : item.column);
  if (ss.isAbsolutePath(file))
    file = ns.getRelativePath(ss.ifBlank(settings.projectRootPath, settings.entryPointPath) , file);
  let result = `${file}:${line}:${column}`;
  result += ss.prefix('    ⮡ ', ss.concatWS('.',item.className, ss.suffix(item.functionName ?? '','()') ) );
  return result;
}


export function formatErrorStack(errorStack:cs.FfArray<StackItem>, options?:StackFormatOptions):string {
  options = options ?? {};
  options.showBootstrapStack = options?.showBootstrapStack ?? settings.showBootstrapStack;
  let found = errorStack.last;

  let result = '';

  if (options?.startFunc) {
    let startFound = errorStack.byFunc( options.startFunc );
    if (startFound)
      found = startFound;
  } else if (!options.showBootstrapStack) {
    if (settings.postBootstrapEntryPointFile == '')
      result += '{showing bootstrap code in stack -- use initEntryPoint() to hide}\n';
    let startFound = errorStack.byFunc( (item) => (item.originalLocation?.file ?? item.file) == settings.postBootstrapEntryPointFile );
    if (startFound)
      found = startFound;
  }

  let indent = '';
  let arrow = '';
  let line = 0;
  if (found) {
    for (let i=found.index; i >= 0; i--) {
      let item = errorStack[i];
      if (options?.filterFunc)
        if (!options.filterFunc(item))
          continue;

      result += indent + arrow + formatStackItem(item) + '\n';

      if (line > 0)
        indent += ' ';
      arrow = '⮡ ';
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

export function getCallerLocation(levelsAbove:number = 1):StackItem|undefined {
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
      /**
       * we skip [0] which is the new Error() call in the try of this function,
       * we also skip [1] which is the call to `getCallerLocation()`
       * using [2] gets us the location that actually called the thing that has the getCallerLocation()
       * using [3] would be the thing that called the thing.. etc.
       */
      return (mappedStack ?? [])[levelsAbove + 1];
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
