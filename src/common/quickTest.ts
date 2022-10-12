/**
 * quickTest
 *
 * a simple testing environment targeting typescript node applications.  Unlike other javascript
 * test runners, this does no dynamic bootstrapping of test files.  Instead, test files are imported
 * and loaded just like any ES6 node module.  That way, all tests run in the exact same environment
 * that the application uses.  For example if you use a bundler to take all .ts and .tsx files
 * transpile and produce a single .js file, that's what you should do to the test code as well.
 * Special care has been taken to always produce errors that map to the correct .ts/.tsx file in
 * your application's code.
 *
 * How to test node's `path` module:
 *
 * [1. create a test file]
 * create a file called `path.test.ts` containing at least this:
 * ``
 * import * as qt from 'quickTest';
 * qt.module( () => {
 *   qt.test('one test', () => {
 *     qt.testValue(1+1).shouldEqual(2);
 *   })
 * });
 * ``
 *
 * [2. create a testing entry point module]
 * create a file called `testsEntryPoint.ts` containing at least this:
 * ```
 * import * as qt from 'quickTest';
 * import './example.test.ts';
 * qt.start();
 * ```
 * Note that you don't have to actually import each `XXX.test.ts` file if you've arranged for them
 * to be imported into the project by another means, such as instructing your bundler to include
 * `*.test.ts` modules as ambient modules.
 *
 * testing algorithm
 *
 * Testing is accomplished in two phases.  The first phase, called the "registration phase", is
 * caused by all of the imported `XXX.test.ts modules` executing one or more of the following
 * functions: `module(), section(), test(), beforeXXX(), and afterXXX()`.  Of those functions, only
 * `module() & section()` will actually execute their function parameters in this phase. The rest
 * will hold off until the second phase. This registration phase establishes the tree of tests that
 * are intended to be run, (or skipped).  Combinations of `module(), section() and test()` are used
 * to build the hierarchy of the overall test tree.  It's important that no actual test code or
 * initialization code be executed in the body of the functions passed to `module() or section()`.
 * Instead, initialization and test code should only be placed inside of `test(), beforeXXX(), and
 * afterXXX()`.
 *
 * The second phase is the "execution phase".  All of the tests gathered in the first phase are run
 * one after the other, in the order in which they were found. Any tests can be skipped by
 * prepending an X to the `module(), section() or test()` functions like so: `Xmodule, Xsection() or
 * Xtest()`.  If you only want to run a certain few tests, prepend an O to the `module(), section()
 * or test()` functions like so: `Omodule(), Osection() or Otest()`.  Any async functions passed to
 * `test(), beforeXXX(), or afterXXX()`, will be executed and waited for so that all tests,
 * including asynchronous ones, are run one after the other.
 *
 */

import * as ss from './systemSupport';
import * as cs from './collectionSupport';
import * as fsp from 'fs/promises';
import { L } from './systemSupport';
import ch from 'chalk';
import * as es from './errorSupport';
import * as ns from './nodeSupport';

const cEsc = '\u001b';
const cIndentCharacter = '\u00A0'; // <- non breaking space
const cIndentSizeInCharacters = 2;
const skipColor = ch.blue;
//const cThumbsUpChar = '\u{1F44D}\uFE0E'; // <-- the \uFE0E keeps special characters from rendering as emojis, and instead uses normal text characters
//const cThumbsDownChar = '\u{1F44E}\uFE0E';
const cShouldBeIcon = '🠞'; // ☑ ➡ ► 🠞 🢂 ⮞
const cBadValueIcon = '⚠'; // ☒ ×


let testCount = 0;

class TestValueError extends Error {
}

function isTestExt(ext:string) {
  return (ext == '.test' || ext == '.spec');
}

export class QuickTestGlobls {
  public stagingPath:string = '';
  public outputToConsole = false;
}

export type SectionFunc = () => void;
export type HelperFunc = () => void | Promise<void>;
export type TestFunc = () => void | Promise<void>;

export interface QuickTestOptions {
  /**
   * sends ansi codes to the terminal to clear it.
   */
  clearTerminal?:boolean;

  /**
   * if your terminal is having trouble clearing (like when running in vscode), this simply
   * starts the testing output with a bunch of blank lines to "clear" the terminal.
   */
  startingBlankLines?:number;

  /**
   * This is set by default from either `process.moduleFile.filename` or `import.meta.uri`. However, if you are
   * launching tests through something other than `node.exe testsEntryPoint.js` or `electron.exe testsEntryPoint.js`,
   * you may need to set this yourself. For example, testing vscode extensions requires this to be set manually,
   * because `process.moduleFile.filename` is set to some `bootstrap-fork.js` file deep inside vscode's install folder.
   */
  testsEntryPointFile?:string;

/**
  *  if quickTest.ts is producing relative links in it's stack trace that vscode can't find when you click on them, try setting this option.
  *
  *  vscode uses its open project folder as the root of clickable relative paths in the debug console.  Set this to a relative path that
  *  takes you from the path of your running application's entry point, to the open folder in vscode. For example, if you have this
  *  structure:
  *  ```
  *  /myProjects
  *    /myTests
  *      /out-tests
  *        testsEntryPoint.js
  *        testsEntryPoint.js.map
  *      /src
  *        testsEntryPoint.ts
  *  ```
  *  if you have the `/myProjects/myTests/` folder open in vscode, then set this in testsEntryPoint.ts:
  *    `qt.start({relativePathFromScriptToVSCodeFolder:'../'})`
  *
  *  That will help point out to quickTest that the relative path from the running script file
  *  `/myProjects/myTests/out-tests/testsEntryPoint.js` to `/myProjects/myTests is` `../`
  */
  relativePathFromScriptToVSCodeFolder?:string;

  /**
   * forces Quick Test to use colors in case it can't be properly detected. Default is `true` because
   * when running in vscode, this is rarely detected properly.
   */
  forceColor?:boolean;

  /**
   * by default, quick test outputs to stdout. This lets the output appear more natural by being able to
   * output the test name, then pause while the test runs, then output the result (check or x) on the same
   * line.  Using the console requires whole lines to be output at once, which isn't ideal.  However, when
   * used to test vscode extensions, output must be sent to the console, or else it is lost.
   */
  outputToConsole?:boolean;

}

abstract class TestItem {
  private _name: string = '';
  public isSkipped: boolean = false;
  private _isOnly: boolean = false;
  private _hasOnlyDescendents: boolean = false;
  public codeFile: string = '';
  public codeLineColumn: string = '';
  public parent: TestItem | undefined;
  public children = new cs.FfArray<ChildTestItem>();
  public level = -1;

  constructor() {
  }

  public get name():string {
    return this._name;
  }
  public set name(name:string) {
    this._name = name;
  }

  /**
   * sets this item as an "only" item, which means that only this item and its descendents should
   * run. A side effect of setting this is that the entire upline gets their
   * {@link hasOnlyDescendents} set to true.
   */
  public get isOnly():boolean {
    return this._isOnly;
  }

  public set isOnly(value:boolean) {
    if (this.parent && value)
      this.parent.hasOnlyDescendents = true;
    this._isOnly = value;
  }

  /**
   * indicates that this item has at least one "only" item among its descendents, which means that
   * this item will have to run in order to reach the descendent. A side effect of setting this to
   * true is that the entire upline also gets their {@link hasOnlyDescendents} set to true.
   */
  public get hasOnlyDescendents():boolean {
    return this._hasOnlyDescendents;
  }

  public set hasOnlyDescendents(value:boolean) {
    if (this.parent && value)
      this.parent.hasOnlyDescendents = true;
    this._hasOnlyDescendents = value;
  }


  public get endLogLineForIsOnly():string {
    return ch.grey(`  ← only (${es.getCodeLocation(this.codeFile,this.codeLineColumn)})`);
  }

  public get endLogLineForIsSkipped():string {
    return ch.grey(`  ← skip (${es.getCodeLocation(this.codeFile,this.codeLineColumn)})`);
  }


  public get indentSize():number {
    let indentLevel = (this.level <= 1 ? 0 : this.level-1);
    return cIndentSizeInCharacters * indentLevel;
  }

  /**
   * by default this indents based on the TestItem.level, using the cIndentCharacter.  However,
   * those can be overridden.
   */
  public indent(s:string,size?:number|number[],indentCharacter:string = cIndentCharacter):string {
    if (typeof size == 'undefined')
      size = this.indentSize;
    //@ts-ignore: overloads got a little too complicated for ts
    return ss.indent(s,size,indentCharacter);
  }

  public get logLine():string {
    return '';
  }

  public checkIfCanBeSkipped() {
    // if there are no items with isSkipped equal to false
    if (! this.children.byFunc(item => !item.isSkipped)) {
      this.isSkipped = true;
      if (this instanceof ChildTestItem)
        this.parent.checkIfCanBeSkipped();
    }
  }

  public run() {
  }
}

abstract class ChildTestItem extends TestItem {
  public parent: TestItem;
  constructor(
    parent: TestItem
  ) {
    super();
    this.parent = parent;
    parent.children.push(this);
    this.level = parent.level + 1;

    // note the location of the test call
    let item = es.getCallerLocationByFunc(cQuickTestStackFormatOptions.startFunc!);
    if (item) {
      this.codeFile = es.getCodeFile(item);
      this.codeLineColumn = es.getCodeLineColumn(item);
    }
  }
}

class RootTestItem extends TestItem {
}

abstract class BaseSection extends ChildTestItem {
  public beforeThisSectionFuncs: HelperFunc[] = [];
  public beforeEachTestFuncs: HelperFunc[] = [];
  public afterEachTestFuncs: HelperFunc[] = [];
  public afterThisSectionFuncs: HelperFunc[] = [];
  constructor(parent: TestItem) {
    super(parent);
  }

  public async runBeforeThisSectionFuncs() {
    for (let func of this.beforeThisSectionFuncs) {
      let result = func();
      if (result instanceof Promise)
        await result;
    }
  }

  public async runBeforeEachTestFuncs() {
    if (this.parent instanceof BaseSection)
      await this.parent.runBeforeEachTestFuncs();
    for (let func of this.beforeEachTestFuncs) {
      let result = func();
      if (result instanceof Promise)
        await result;
    }
  }

  public async runAfterEachTestFuncs() {
    if (this.parent instanceof BaseSection)
      await this.parent.runAfterEachTestFuncs();
    for (let func of this.afterEachTestFuncs) {
      let result = func();
      if (result instanceof Promise)
        await result;
    }
  }

  public async runAfterThisSectionFuncs() {
    for (let func of this.afterThisSectionFuncs) {
      let result = func();
      if (result instanceof Promise)
        await result;
    }
  }

}

class Section extends BaseSection {
  constructor() {
    let found = testItemStack.last;
    if (!  (found && (found.value instanceof BaseSection)) )
      throw Error(`section() must be called from within a module() function or another section() function, not on its own or inside of a test()`);
    let parent = found.value;
    super(parent);
  }

  public get logLine():string {
    let result = `${this.name}`;
    if (this.isSkipped)
      result = skipColor(result) + this.endLogLineForIsSkipped;
    if (this.isOnly)
      result += this.endLogLineForIsOnly;
    return this.indent(result);
  }

}

class ModuleSection extends BaseSection {
  public file: string = '';
  constructor() {
    super(rootTestItem);
    if (testItemStack.last)
      throw Error(`module() must be called from the body of a module, not inside of any section(), module(), or test() functions.`);
  }

  public get name():string {
    return ss.extractFileName(this.file);
  }

  public get logLine():string {
    let result = `\n[${this.name}]`;
    if (this.isSkipped)
      result = skipColor(result) + this.endLogLineForIsSkipped;
    else if (this.isOnly)
      result += this.endLogLineForIsOnly;
    else
      result += ch.grey('  (' + es.resolveFromProjectPath(this.file) + ')');
    return this.indent(result);
  }
}

class Test extends ChildTestItem {
  public testFunc: TestFunc;
  public parent: BaseSection;
  public isPassed: boolean;
  public isException: boolean;
  public testValueError: TestValueError | undefined;
  public exceptionError: Error | undefined;
  constructor(
    testFunc: TestFunc
  ) {
    let found = testItemStack.last;
    if (!  (found && (found.value instanceof BaseSection)) )
      throw Error(`test() must be called from within a module() or section() function, not on its own or inside of another test()`);
    let parent = found.value;
    super(parent);
    this.parent = parent;
    this.testFunc = testFunc;
    this.isPassed = false;
    this.isException = false;
    testCount++;
  }

  public get logLine():string {
    let result = `${this.name}`;
    if (this.isSkipped)
      result += skipColor(' ⨂') + this.endLogLineForIsSkipped;
    return this.indent(result);
  }

  public get logResults():string {
    let result = ` ${(this.isPassed ? '✔️' : '❌')}${(this.isException ? ' 🔥' : '')}`;
    if (this.isOnly)
      result += this.endLogLineForIsOnly;
    if (!this.isPassed) {
      let message;
      let stack;
      let unmappedStack:cs.FfArray<es.StackItem> | undefined;
      let formatOptions:es.StackFormatOptions;
      if (this.isException) {
        formatOptions = cQuickTestStackExceptionFormatOptions;
        stack = this.exceptionError!.stack; // <-- keep this ununsed assignment here, it allows es.getMappedStack() to get the stack.
        message = `${this.exceptionError!.name}: ${this.exceptionError!.message}\n`;
        unmappedStack = (this.exceptionError as any).unmappedStack;
      } else {
        formatOptions = cQuickTestStackFormatOptions;
        stack = this.testValueError!.stack; // <-- keep this ununsed assignment here, it allows es.getMappedStack() to get the stack.
        message = this.testValueError!.message;
        unmappedStack = (this.testValueError as any).unmappedStack;
      }
      result += '\n' + this.indent(message,cIndentSizeInCharacters);
      let mappedStack = es.getMappedStack(unmappedStack);
      let codeLocation = es.getCodeLocation(this.codeFile, this.codeLineColumn);
      if (mappedStack && mappedStack.length)
        result += this.indent(this.indent('at: ' + ch.grey(es.formatErrorStack(mappedStack,formatOptions)), [0,4]), cIndentSizeInCharacters);
      else
        result += this.indent(this.indent('at: ' + ch.grey(codeLocation + '  |  note: error did not have a stack trace'), [0,4]), cIndentSizeInCharacters);

    }
    return this.indent(result,[0,this.indentSize]);
  }

  public async run() {
    if (this.isSkipped)
      return;
    await this.parent.runBeforeEachTestFuncs();
    try {
      let result = this.testFunc();
      if (result instanceof Promise)
        await result;
      this.isPassed = true;

    } catch (e) {
      if (e instanceof TestValueError)
        this.testValueError = e;
      else if (e instanceof Error) {
        this.isException = true;
        this.exceptionError = e;
      } else
        throw e;
    }
    await this.parent.runAfterEachTestFuncs();
  }
}

let rootTestItem = new RootTestItem();
let testItemStack = new cs.FfArray<TestItem>();



export class DeepEqualResult {
  isEqual:boolean = false;
  property:string = '';
  aValue:string = '';
  bValue:string = '';
  aIsMissing:boolean = false;
  bIsMissing:boolean = false;
}

/**
 * gets the file of the calling XXX.test file.
 */
function getCallerModuleFile(parentCallerLevel:number=0) {
  let item = es.getCallerLocation(2+parentCallerLevel); // <-- get the location of the caller's parent's parent
  if (item) {
    if (item.originalLocation)
      return item.originalLocation.file;
    else
      return item.file
  }
  return '';
}

/**
 * determines if a value can be tested as a whole.  For example, all primitives, like number, string, and boolean
 * can be tested by simply using `==`.  However other things non-primitive, (but still very basic types) like Date,
 * Regex, null, and undefined aught to be treated like primitives, where their "values" can be compared directly.
 */
export function getKnownType(obj:any):string {
   let result = 'primitive';
   if (obj instanceof RegExp)
     result = 'RegExp'
   else if (obj instanceof Date)
     result = 'Date'
   else if (typeof obj == 'function')
     result = 'function'
   else if (typeof obj == 'object')
     result = 'object'
   return result;
}

function deepEqualArray(a:Array<any>,b:Array<any>,result:DeepEqualResult):DeepEqualResult {
  for (let i=0; i<a.length; i++) {
    if (i < b.length) {
      result = deepEqual(a[i],b[i],result.property+`[${i}]`);
      if (!result.isEqual)
        return result;
    } else {
      result.isEqual = false;
      result.property += `[${i}]`;
      result.aValue = a[i];
      result.bIsMissing = true;
      return result;
    }
  }
  if (a.length < b.length){
    result.isEqual = false;
    result.property += `[${a.length}]`;
    result.bValue = b[a.length];
    result.aIsMissing = true;
    return result;
  }
  return result;
}

function deepEqualMap(a:Map<any,any>,b:Map<any,any>,result:DeepEqualResult):DeepEqualResult {
  for (let [key,item] of a) {
    if (b.has(key)) {
      result = deepEqual(item,b.get(key),result.property+`[${JSON.stringify(key)}]`);
      if (!result.isEqual)
        return result;
    } else {
      result.isEqual = false;
      result.property += `.get(${JSON.stringify(key)})`;
      result.aValue = item;
      result.bIsMissing = true;
      return result;
    }
  }
  for (let [key,item] of b) {
    if (!a.has(key)) {
      result.isEqual = false;
      result.property += `.get(${JSON.stringify(key)})`;
      result.aIsMissing = true;
      return result;
    }
  }
  return result;
}

function deepEqualSet(a:Set<any>,b:Set<any>,result:DeepEqualResult):DeepEqualResult {
  for (let key of a) {
    if (!b.has(key)) {
      result.isEqual = false;
      result.property += `.has(${JSON.stringify(key)})`;
      result.bIsMissing = true;
      return result;
    }
  }
  for (let key of b) {
    if (!a.has(key)) {
      result.isEqual = false;
      result.property += `.has(${JSON.stringify(key)})`;
      result.aIsMissing = true;
      return result;
    }
  }
  return result;
}

function deepEqualObject(a:any,b:any,result:DeepEqualResult):DeepEqualResult {
  for (let property in a) {
    if (b.hasOwnProperty(property)) {
      result = deepEqual(a[property],b[property],result.property+property);
      if (!result.isEqual)
        return result;
    } else {
      result.isEqual = false;
      result.property += property;
      result.bIsMissing = true;
      return result;
    }
  }

  for (let property in b) {
    if (!a.hasOwnProperty(property)) {
      result.isEqual = false;
      result.property += property;
      result.aIsMissing = true;
      return result;
    }
  }
  return result;
}

export function deepEqual(a:any, b:any, propertyPath:string=''):DeepEqualResult {
  let result = new DeepEqualResult();
  let knownType = getKnownType(a);
  let knownTypeB = getKnownType(b);

  if ( knownType != knownTypeB ) {
    result.isEqual = false;
    result.property = propertyPath;
    result.aValue = String(a)+' <'+knownType+'>';
    result.bValue = String(b)+' <'+knownTypeB+'>';
    return result;
  }

  if ( ['Date','RegExp','function'].includes(knownType) ) {
    result.isEqual = (String(a) == String(b));
    if (!result.isEqual) {
      result.property = propertyPath;
      result.aValue = String(a);
      result.bValue = String(b);
    }
    return result;
  }

  if ( knownType == 'primitive' ) {
    result.isEqual = (a === b);
    if (!result.isEqual) {
      result.property = propertyPath;
      result.aValue = String(a);
      result.bValue = String(b);
    }
    return result;
  }

  if ( knownType != 'object' ) {
    throw Error('unknown property type: {…}.'+propertyPath)
  }

  if ((a as Object).constructor !== (a as Object).constructor) {
    result.isEqual = false;
    result.property = propertyPath;
    result.aValue = String(a)+' <instance of '+(a as Object).constructor.name+'>';
    result.bValue = String(b)+' <instance of '+(b as Object).constructor.name+'>';
    return result;
  }

  if (a instanceof Array) {
    result = deepEqualArray(a as Array<any>, b as Array<any>, result);
  } else if (a instanceof Map) {
    result = deepEqualMap(a as Map<any,any>, b as Map<any,any>, result);
  } else if (a instanceof Set) {
    result = deepEqualSet(a as Set<any>, b as Set<any>, result);
  } else {
    result.property = ss.suffix(propertyPath,'.');
    result = deepEqualObject(a, b, result);
  }

  return result;
}


class ValueTester {
  constructor (
    public testValue:any
  ) {}

  private format(value:any):string {
    if (typeof value == 'undefined')
      return 'undefined';
    if (value == null)
      return 'null';
    return JSON.stringify(value,undefined,2);
  }

  private error(property:string, testValue:any, shouldBeLabel:string) {  // ☑ ☒ 🖒 🖓
    let testValueLabel = 'but, got this';
    property = ss.infix('{…}.',property,': ');
    throw new TestValueError(L`
      ${cShouldBeIcon} ${shouldBeLabel}
      ${cBadValueIcon} ${testValueLabel}: ${property}${ss.indent(this.format(testValue),[0,2+testValueLabel.length+2+property.length],cIndentCharacter)}
    `)
  }

  private valueError(property:string, testValue:unknown, shouldBeValue:unknown, shouldBeLabel:string) {
    let testValueLabel = 'but, got this:';
    shouldBeLabel = `${shouldBeLabel}:`;
    property = ss.infix('{…}.',property,': ');
    let maxLength = Math.max(testValueLabel.length,shouldBeLabel.length);
    throw new TestValueError(L`
      ${cShouldBeIcon} ${shouldBeLabel.padEnd(maxLength,' ')} ${property}${ss.indent(this.format(String(shouldBeValue)),[0,2+maxLength+2+property.length],cIndentCharacter)}
      ${cBadValueIcon} ${testValueLabel.padEnd(maxLength,' ')} ${property}${ss.indent(this.format(String(testValue)),[0,2+maxLength+2+property.length],cIndentCharacter)}
    `)
  }

  /**
   * same as using `==`
   */
  public shouldEqual(expectedValue:any) {
    if (! (this.testValue == expectedValue) )
      this.valueError('',this.testValue,expectedValue,'should equal');
  }

  /**
   * same as using `===`
   */
  public shouldStrictlyEqual(expectedValue:any) {
    if (! (this.testValue === expectedValue) )
      this.valueError('',this.testValue,expectedValue,'should strictly equal');
  }

  /**
   * same as using `if (value == null)` i.e. the value can't either be `null` or `undefined`
   */
  public get shouldBeDefined() {
    if ( this.testValue == null )
      this.error('',this.testValue,'should be defined');
    return -1;
  }

  /**
   * same as using `if (value != null)` i.e. the value can't either be `null` or `undefined`
   */
  public get shouldBeUndefined() {
    if (this.testValue != null)
      this.error('',this.testValue,'should be: undefined');
    return -1;
  }

  /**
   * uses checks that every member and element are strictly equal to each other.  This will fail as soon
   * as the first item doesn't match.
   */
  public shouldDeepEqual(expectedValue:any) {
    let result = deepEqual(this.testValue,expectedValue);
    if (!result.isEqual) {
      if (result.aIsMissing)
        this.error(result.property,result.bValue,'should exist');
      else if (result.bIsMissing)
        this.error(result.property,result.aValue,'should not exist');
      else
        this.valueError(
          result.property,
          result.aValue,
          result.bValue,
          'should equal'
        );
    }
  }


  public async shouldThrowError(containing:string) {
    try {
      let returnValue = this.testValue();
      if (returnValue instanceof Promise)
        await returnValue;
      this.error('','<no error>',`should throw an error containing "${containing}" in the message`);
    } catch (e:unknown) {
      if (!(e instanceof Error)) {
        this.error('','function',`should throw an Error object`);
        return;
      }
      if (e.message.includes(containing))
        return;
      this.error('',`${e.constructor.name}: ${e.message}`,`should throw an error containing "${containing}" in the message`);
    }
    return;
  }

  /**
   * same as using `if (value)` i.e. the value must be "truthy"
   *
   * use `strictlyTrue` to check if it is set to Boolean(true)
   */
  public get shouldBeTrue() {
    if (! this.testValue)
      this.valueError('',this.testValue, true, 'should be');
    return -1;
  }

  /**
   * same as using `if (value === true)`
   */
  public get shouldBeStrictlyTrue() {
    if ( this.testValue !== true)
      this.error('',this.testValue,'should be strictly true')
    return -1;
  }

  /**
   * same as using `if (!value)` i.e. the value must be "falsy"
   *
   * use `strictlyFalse` to check if it is set to Boolean(false)
   */
  public get shouldBeFalse() {
    if (this.testValue)
      this.valueError('',this.testValue, false, 'should be');
    return -1;
  }

  /**
   * same as using `if (value === false)`
   */
  public get shouldBeStrictlyFalse() {
    if ( this.testValue !== false)
      this.error('',this.testValue,'should be strictly false')
    return -1;
  }

  public shouldStartWith(expectedValue:string) {
    if (
      (typeof this.testValue == 'string') &&
      (this.testValue.startsWith(expectedValue))
    ) {
      // do nothing
    } else
      this.valueError('',this.testValue,expectedValue,'should start with');
  }

}



function getCurrentSection(functionName:string):BaseSection {
  let found = testItemStack.last;
  if (! (found && (found.value instanceof BaseSection)) )
    throw (`${functionName}() must be called inside of a module() or section() function, not on its own, or inside of a test().`);
  return found.value;
}

/**
* establishes the module's main section in the testing hierarchy, ex:
* ```
* qt.module(() => {
*   qt.section('strings', () => {
*     qt.section('concatenation', () => {
*       qt.test('simple', () => {
*         qt.value('a'+'b').shouldEqual('ab');
*       });
*     });
*   });
* });
* ```
* will produce:
* ```
* [example.test.ts]  (./src/example.test.ts)
* strings
*   concatenation
*     simple ✔️
* ```
* @param moduleFunc the function that contains the calls to section() and/or test()
* @param moduleSection is only for internal use.
*/
export function module(moduleFunc:SectionFunc):void;
export function module(moduleFunc:SectionFunc, moduleSection:ModuleSection):void;
export function module(moduleFunc:SectionFunc, moduleSection?:ModuleSection):void {
  let parentCaller = 1;
  if (! moduleSection) {
    moduleSection = new ModuleSection();
    parentCaller = 0;
  }
  moduleSection.file = getCallerModuleFile(parentCaller);
  testItemStack.push(moduleSection);
  moduleFunc();
  testItemStack.pop();
}

/**
* disables tests for the entire test module
* ```
* qt.Xmodule(() => {
*   qt.section('strings', () => {
*     qt.section('concatination', () => {
*       qt.test('simple', () => {
*         qt.value('a'+'b').shouldEqual('ab');
*       });
*     });
*   });
* });
* ```
* will produce:
* ```
* [example.test.ts] ← skip (../src/example.test.ts)
* ```
*/
export function Xmodule(moduleFunc:SectionFunc) {
  let moduleSection = new ModuleSection();
  moduleSection.isSkipped = true;
  module(moduleFunc, moduleSection);
}

/**
* disables tests for all other modules, except this one
* ```
* qt.Omodule(() => {
*   qt.section('strings', () => {
*     qt.section('concatination', () => {
*       qt.test('simple', () => {
*         qt.value('a'+'b').shouldEqual('ab');
*       });
*     });
*   });
* });
* ```
* will produce:
* ```
* [example.test.ts] ← only (../src/example.test.ts:1:1)
* strings
*   concatenation
*     simple ✔️
* ```
*/
export function Omodule(moduleFunc:SectionFunc) {
  let moduleSection = new ModuleSection();
  moduleSection.isOnly = true;
  module(moduleFunc, moduleSection);
}

/**
* establishes a new named section in the testing hierarchy, ex:
* ```
* qt.module(() => {
*   qt.section('strings', () => {
*     qt.section('concatination', () => {
*       qt.test('simple', () => {
*         qt.value('a'+'b').shouldEqual('ab');
*       });
*     });
*   });
* });
* ```
* will produce:
* ```
* [example.test.ts]  (../src/example.test.ts)
* strings
*   concatenation
*     simple ✔️
* ```
*/
export function section(name:string, sectionFunc:SectionFunc):void;
export function section(name:string, sectionFunc:SectionFunc, newSection:Section):void;
export function section(name:string, sectionFunc:SectionFunc, newSection?:Section):void {
  if (!newSection)
    newSection = new Section();
  newSection.name = name;
  testItemStack.push(newSection);
  sectionFunc();
  testItemStack.pop();
}

/**
* disables the section and all of its tests and subsections below it
* ```
* qt.module(() => {
*   qt.Xsection('strings', () => {
*     qt.section('concatination', () => {
*       qt.test('simple', () => {
*         qt.value('a'+'b').shouldEqual('ab');
*       });
*     });
*   });
*   qt.section('math', () => {
*     qt.section('addition', () => {
*       qt.test('simple', () => {
*         qt.value(1+1).shouldEqual(2);
*       });
*     });
*   });
* });
* ```
* will produce:
* ```
* [example.test.ts]  (../src/example.test.ts)
* strings ← skip (./example.test.ts:2:3)
* math
*   addition
*     simple ✔️
* ```
*/
export function Xsection(name:string, sectionFunc:SectionFunc) {
  let newSection = new Section();
  newSection.isSkipped = true;
  section(name,sectionFunc,newSection);
}

/**
* "Only this section" - disables all other section and tests except those below this section
* ```
* qt.module( () => {
*   qt.section('strings' () => {
*     qt.Osection('concatination' () => {
*       qt.test('simple', () => {
*         qt.value('a'+'b').shouldEqual('ab');
*       });
*     });
*   });
*   qt.section('math', () => {
*     qt.section('addition', () => {
*       qt.test('simple', () => {
*         qt.value(1+1).shouldEqual(2);
*       });
*     });
*   });
* });
* ```
* will produce:
* ```
* [example.test.ts]  (../src/example.test.ts)
* strings
*   concatenation ← only (./example.test.ts:3:5)
*     simple ✔️
* ```
*/
export function Osection(name:string, sectionFunc:SectionFunc) {
  let newSection = new Section();
  newSection.isOnly = true;
  section(name,sectionFunc,newSection);
}

/**
* executes before the tests in its section.
*/
export function beforeThisSection(helperFunc:HelperFunc) {
  let section = getCurrentSection('beforeThisSection');
  section.beforeThisSectionFuncs.push(helperFunc);
}

/**
* executes before each test in the section and subsections below it.
*/
export function beforeEachTest(helperFunc:HelperFunc) {
  let section = getCurrentSection('beforeEachTest');
  section.beforeEachTestFuncs.push(helperFunc);
}

/**
* executes after each test in the section and subsections below it.
*/
export function afterEachTest(helperFunc:HelperFunc) {
  let section = getCurrentSection('afterEachTest');
  section.afterEachTestFuncs.push(helperFunc);
}

/**
* executes after all of the tests the section.
*/
export function afterThisSection(helperFunc:HelperFunc) {
  let section = getCurrentSection('afterThisSection');
  section.afterThisSectionFuncs.push(helperFunc);
}

/**
 * queues a test to run.
 & @param testFunc can either be synchronous or asynchronous.  If it returns a Promise
 * (is aynchronous) it will be `awaited` by the test runner when it's turn comes to run.
 */
export function test(name:string, testFunc:TestFunc):void;
export function test(name:string, testFunc:TestFunc, newTest:Test):void;
export function test(name:string, testFunc:TestFunc, newTest?:Test) {
  if (!newTest)
    newTest = new Test(testFunc);
  newTest.name = name;
  newTest.testFunc = testFunc;
}

/**
* disable this test
*/
export function Xtest(name:string, testFunc:TestFunc) {
  let newTest = new Test(testFunc);
  newTest.isSkipped = true;
  test(name, testFunc, newTest);
}

/**
* only run this test
*/
export function Otest(name:string, testFunc:TestFunc) {
  let newTest = new Test(testFunc);
  newTest.isOnly = true;
  test(name, testFunc, newTest);
}

/**
* tests a value
*/
export function testValue(value:any):ValueTester {
  return new ValueTester(value);
}

let unfinishedLogLine = '';
function log(s:string, options?:{endWithNewLine?:boolean}) {
  s = ch.white(unfinishedLogLine + s);
  if (globals.outputToConsole)
    if (options?.endWithNewLine ?? true) {
      console.log(s);
      unfinishedLogLine = '';
    } else
      unfinishedLogLine = s;
  else {
    process.stdout.write(s);
    if (options?.endWithNewLine ?? true)
      process.stdout.write('\n');
  }
}

/**
 * the idea is that
 */
const cQuickTestStackFormatOptions:es.StackFormatOptions = {
  startFunc:(item) => {
    return isTestExt(ss.extractFileExt(ss.removeFileExt(item.originalLocation?.file ?? '')));
  },
  filterFunc: (item) => {
    return ss.extractFileName(item.originalLocation?.file ?? '') != 'quickTest.ts';
  }
}

const cQuickTestStackExceptionFormatOptions:es.StackFormatOptions = {
  startFunc:(item) => {
    return isTestExt(ss.extractFileExt(ss.removeFileExt(item.originalLocation?.file ?? '')));
  }
}

const cQuickTestDeepStackFormatOptions:es.StackFormatOptions = {
  startFunc:(item) => {
    return isTestExt(ss.extractFileExt(ss.removeFileExt(item.originalLocation?.file ?? '')));
  }
}

function clearTerminal() {
  process.stdout.write(cEsc+'c');
  process.stdout.write(cEsc+'[2J');
}

class TestRunner {

  public counts = {
    passed: 0,
    failed: 0,
    exceptions: 0
  }

  /**
   * recursively loops through the child TestItems and runs them.  This is designed to be started
   * off by passing it the root node's children.  This skips any items that have the "skip" flag.
   * @param isOnlyMode  a flag that helps ignore items that are not "only" items or decendents of
   * "only" items.
   */
  public async runChildren(children:cs.FfArray<ChildTestItem>, isOnlyMode:boolean) {
    for (let testItem of children) {

      if (isOnlyMode && !(testItem.isOnly || testItem.hasOnlyDescendents)) {
        continue; // <-- skip this item because it's outside of the "only" items
      }

      if (testItem.isSkipped) {
        log(testItem.logLine);
        continue; // <-- skip this item because it was explicitly skipped using an "X" function
      }

      if (testItem instanceof BaseSection) {
        log(testItem.logLine);
        await testItem.runBeforeThisSectionFuncs();
      }

      await this.runChildren(testItem.children, testItem.hasOnlyDescendents);

      if (testItem instanceof Test) {
        log(testItem.logLine, {endWithNewLine:false});
        await testItem.run();
        log(testItem.logResults);

        // gather stats
        if (!testItem.isSkipped) {
          if (testItem.isPassed)
            this.counts.passed++;
          else {
            this.counts.failed++;
            if (testItem.isException)
              this.counts.exceptions++;
          }
        }

      }

      if (testItem instanceof BaseSection)
        await testItem.runAfterThisSectionFuncs();

    }
  }

}


/**
 * kicks off the actual testing after the test registration phase is complete.
 */
export async function start(options?:QuickTestOptions) {

  // note: since this happens *after* the registration phase, nothing set in here can
  //       affect the way registration happens.  That's why, during the registration phase
  //       any paths gathered must be absolute.  Then when outputting paths, we'll
  //       create the relative paths.

  // override the entrypoint settings items with more definitive info.
  es.initEntryPoint({
    levelsAbove: 0,
    relativePathFromScriptToVSCodeFolder: options?.relativePathFromScriptToVSCodeFolder
  });

  if (typeof options?.testsEntryPointFile == 'string')
    es.settings.entryPointFile = ss.internalizePath(options?.testsEntryPointFile);

  if (options?.forceColor ?? true)
    ch.level = 1;

  if (options?.outputToConsole ?? false)
    globals.outputToConsole = true;

  globals.stagingPath = ss.internalizePath(es.settings.entryPointPath)+'staging/';
  if (await ns.pathExists( es.settings.entryPointPath ))
    if (! (await ns.pathExists(globals.stagingPath)) )
      await fsp.mkdir(globals.stagingPath, { recursive: true });

  if (options?.clearTerminal ?? false)
    clearTerminal();

  if (typeof options?.startingBlankLines == 'number')
    log('\n'.repeat(options.startingBlankLines));

  log(ch.green(L`
    Starting Tests
    --------------------------------------------------------------------------------------------`));

  let testRunner = new TestRunner();
  try {
    await testRunner.runChildren(rootTestItem.children, rootTestItem.hasOnlyDescendents);
    log(L`

      -----------------------------------------`);
    log(`✔️ tests passed: ${testRunner.counts.passed == testCount ? 'all ':''}${testRunner.counts.passed}`);
    if (testRunner.counts.failed > 0)
      log(`❌ test failed: ${testRunner.counts.failed}`);
    if (testRunner.counts.exceptions > 0)
      log(`🔥 exceptions: ${testRunner.counts.exceptions}`);

    let skippedCount = testCount - testRunner.counts.passed - testRunner.counts.failed;
    if (skippedCount)
      log(`${skipColor('⨂')}  tests skipped: ${skippedCount}`);

    log(`\n\n`);

  } catch (e) {
    console.log(es.getFullErrorMessage(e));
  }
}


// initialization ------------------------------------------------------------------------------
export let globals = new QuickTestGlobls();
