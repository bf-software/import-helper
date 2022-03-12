/**
 * quickTest
 *
 * a simple testing environment targeting typescript node applications.  Unlike other javascript test runners, this
 * does no dynamic bootstrapping of test files.  Instead, test files are imported and loaded just like any ES6 node
 * module.  That way, all tests run in the exact same environment that the application uses.  For example if you use
 * a bundler to take all .ts and .tsx files transpile and produce a single .js file, that's what you should do to the
 * test code as well.  Special care has been taken to always produce errors that map to the correct .ts/.tsx file
 * in your application's code.
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
 * Note that you don't have to actually import each `XXX.test.ts` file if you've arranged for them to be imported into the
 * project by another means, such as instructing your bundler to include `*.test.ts` modules as ambient modules.
 *
 * testing algorithm
 *
 * Testing is accomplished in two phases.  The first phase, called the "registration phase", is caused by all of the imported
 * `XXX.test.ts modules` executing one or more of the following functions: `module(), section(), test(), beforeXXX(), and
 * afterXXX()`.  Of those functions, only `module() & section()` will actually execute their function parameters in this phase.
 * The rest will hold off until the second phase. This registration phase establishes the tree of tests that are intended to be
 * run, (or skipped).  Combinations of `module(), section() and test()` are used to build the hierarchy of the tree.  It's
 * important that no test or initialization code be executed in the body of the function passed to `module() or section()`.
 * Instead, initialization and test code should only be placed inside of `test(), beforeXXX(), and afterXXX()`.
 *
 * The second phase is the "execution phase".  All of the tests gathered in the first phase are run one after the other, in the
 * order in which they were found. Any tests can be skipped by prepending an X to the `module(), section() or test()` functions
 * like so: `Xmodule, Xsection() or Xtest()`.  If you only want to run a certain few tests, prepend an O to the `module(),
 * section() or test()` functions like so: `Omodule(), Osection() or Otest()`.  Any async functions passed to `test(),
 * beforeXXX(), or afterXXX()`, will be executed and waited for so that all tests, including asynchronous ones, are run one
 * after the other.
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
let isOnlyTestsExist = false;
let causedIsSkippedTests: ChildTestItem[] = [];

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
  public _causedIsOnly: boolean = false;
  public _causedIsSkiped: boolean = false;
  public codeLocation: string = '';
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

  public get isOnly():boolean {
    return this._isOnly;
  }

  public set isOnly(value:boolean) {
    if (value)
      isOnlyTestsExist = true;
    this._isOnly = value;
  }

  public get causedIsOnly():boolean {
    return this._causedIsOnly;
  }

  public set causedIsOnly(value:boolean) {
    this._causedIsOnly = value;
    if (value)
      isOnlyTestsExist = true;
  }


  public get causedIsSkiped():boolean {
    return this._causedIsSkiped;
  }

  public set causedIsSkiped(value:boolean) {
    this._causedIsSkiped = value;
    if (this instanceof ChildTestItem)
      causedIsSkippedTests.push(this);
  }


  public get isOnlyLogLine():string {
    return ch.grey(`  ← only (${this.codeLocation})`);
  }

  public get isSkippedLogLine():string {
    if (this.causedIsSkiped)
      return ch.grey(`  ← skip (${this.codeLocation})`);
    return '';
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
  constructor(
    public parent: TestItem
  ) {
    super();
    parent.children.push(this);
    this.level = parent.level + 1;
    if (this.ancestorCausedIsOnly)
      this.isOnly = true;
    this.isSkipped = parent.isSkipped;

    // note the location of the test call
    let item = es.getCallerLocationByFunc(cQuickTestStackFormatOptions.startFunc!);
    if (item)
      this.codeLocation = es.formatStackItem(item);
  }

  // public get hasInheritedIsOnly():boolean {
  //   let result = this.isOnly || this.parent.isOnly;
  //   if (!result && this.parent instanceof ChildTestItem)
  //     result = this.parent.hasInheritedIsOnly;
  //   return result;
  // }

  public get isOnly():boolean {
    return super.isOnly;
  }

  /**
   * setting a child's isOnly to true sets it's entire upline to true as well. Additionally,
   * children added to this TestItem will inherit the isOnlyValue as well.
   */
  public set isOnly(value:boolean) {
    super.isOnly = value;
    if (super.isOnly)
      if (!this.parent.isOnly)
        this.parent.isOnly = true;
  }

  public get ancestorCausedIsOnly():boolean {
    if (this.parent.causedIsOnly)
      return true;
    if (this.parent instanceof ChildTestItem)
      return this.parent.ancestorCausedIsOnly;
    return false;
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
    if (this.isSkipped || (isOnlyTestsExist && !this.isOnly) )
      return;
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
    if (this.isSkipped || (isOnlyTestsExist && !this.isOnly) )
      return;
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
      result = skipColor(result) + this.isSkippedLogLine;
    if (this.causedIsOnly)
      result += this.isOnlyLogLine;
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
      result = skipColor(result) + this.isSkippedLogLine;
    if (this.causedIsOnly)
      result += this.isOnlyLogLine;
    else
      result += ch.grey('  (' + ns.getRelativePath(es.settings.entryPointPath, this.file)+ ')');
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
      result = skipColor(result);
    return this.indent(result);
  }

  public get logResults():string {
    if (this.isSkipped)
      return skipColor(' ⨂') + this.isSkippedLogLine;
    let result = ` ${(this.isPassed ? '✔️' : '❌')}${(this.isException ? ' 🔥' : '')}`;
    if (this.causedIsOnly)
      result += this.isOnlyLogLine;
    if (!this.isPassed) {
      let message;
      let stack;
      let unmappedStack:cs.FfArray<es.StackItem> | undefined;
      if (this.isException) {
        stack = this.exceptionError!.stack; // <-- keep this ununsed assignment here, it allows es.getMappedStack() to get the stack.
        message = `${this.exceptionError!.name}: ${this.exceptionError!.message}\n`;
        unmappedStack = (this.exceptionError as any).unmappedStack;
      } else {
        stack = this.testValueError!.stack; // <-- keep this ununsed assignment here, it allows es.getMappedStack() to get the stack.
        message = this.testValueError!.message;
        unmappedStack = (this.testValueError as any).unmappedStack;
      }
      result += '\n' + this.indent(message,cIndentSizeInCharacters);
      let mappedStack = es.getMappedStack(unmappedStack);
      if (mappedStack && mappedStack.length)
        result += this.indent('at: ' + ch.grey(es.formatErrorStack(mappedStack,cQuickTestStackFormatOptions)), cIndentSizeInCharacters);
      else
        result += this.indent('at: ' + ch.grey(this.codeLocation + '  |  note: error did not have a stack trace'), cIndentSizeInCharacters);

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
function getTestModuleFile() {
  let item = es.getCallerLocation(2);
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

  private format(value:any) {
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

  public get shouldThrowError() {
    try {
      this.testValue();
    } catch (e) {
      return -1;
    }
    this.error('','function','should throw an error');
    return -1;
  }

  /**
   * same as using `if (value)` i.e. the value must be "truthy"
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
   */
  public get shouldBeFalse() {
    if (this.testValue)
      this.valueError('',this.testValue, false, 'should be');
    return -1;
  }

  /**
   * same as using `if (value === false)`
   */
  public shouldBeStrictlyFalse() {
    if ( this.testValue === true)
      this.error('',this.testValue,'should be strictly false')
    return -1;
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
* [./example.test.ts]
* strings
*   concatenation
*     simple ✔️
* ```
*/
export function module(moduleFunc:SectionFunc):void;
export function module(moduleFunc:SectionFunc, moduleSection:ModuleSection):void;
export function module(moduleFunc:SectionFunc, moduleSection?:ModuleSection):void {
  if (! moduleSection)
    moduleSection = new ModuleSection();
  moduleSection.file = getTestModuleFile();
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
* [./example.test.ts] ⨂
* strings ⨂
*   concatenation ⨂
*     simple ⨂
* ```
*/
export function Xmodule(moduleFunc:SectionFunc) {
  let moduleSection = new ModuleSection();
  moduleSection.isSkipped = true;
  moduleSection.causedIsSkiped = true;
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
* [./example.test.ts] ⭘
* strings ⭘
*   concatenation ⭘
*     simple ✔️
*
* [./other.test.ts] ⨂
* other ⨂
*   test ⨂
* ```
*/
export function Omodule(moduleFunc:SectionFunc) {
  let moduleSection = new ModuleSection();
  moduleSection.isOnly = true;
  moduleSection.causedIsOnly = true;
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
* [./example.test.ts]
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
* [./example.test.ts]
* strings ⨂ (./example.test.ts:2:3)
*   concatenation ⨂
*     simple ⨂
* math
*   addition
*     simple ✔️
* ```
*/
export function Xsection(name:string, sectionFunc:SectionFunc) {
  let newSection = new Section();
  newSection.isSkipped = true;
  newSection.causedIsSkiped = true;
  section(name,sectionFunc,newSection);
}

/**
* disables all other section and tests except those below this section
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
* [./example.test.ts]
* strings
*   concatenation ⭘ (./example.test.ts:3:5)
*     simple ✔️
* math ⨂
*   addition ⨂
*     simple ⨂
* ```
*/
export function Osection(name:string, sectionFunc:SectionFunc) {
  let newSection = new Section();
  newSection.isOnly = true;
  newSection.causedIsOnly = true;
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
  newTest.causedIsSkiped = true;
  test(name, testFunc, newTest);
}

/**
* only run this test
*/
export function Otest(name:string, testFunc:TestFunc) {
  let newTest = new Test(testFunc);
  newTest.isOnly = true;
  newTest.causedIsOnly = true;
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

const cQuickTestStackFormatOptions:es.StackFormatOptions = {
  startFunc:(item) => {
    return isTestExt(ss.extractFileExt(ss.removeFileExt(item.originalLocation?.file ?? '')));
  },
  filterFunc: (item) => {
    return ss.extractFileName(item.originalLocation?.file ?? '') != 'quickTest.ts';
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

  public async runChildren(children:cs.FfArray<ChildTestItem>) {
    for (let testItem of children) {

      if (isOnlyTestsExist && !testItem.isOnly)
        continue;

      if (testItem instanceof BaseSection) {
        log(testItem.logLine);
        await testItem.runBeforeThisSectionFuncs();
      }

      await this.runChildren(testItem.children);

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


function preprocessSkippedTests() {
  for (let item of causedIsSkippedTests) {
    item.parent.checkIfCanBeSkipped();
  }
}

/**
 * kicks off the actual testing after the test registration phase is complete.
 */
export async function start(options?:QuickTestOptions) {

  // override the entrypoint settings items with more definitive info.
  es.initEntryPoint({levelsAbove: 2});

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

  preprocessSkippedTests();

  let testRunner = new TestRunner();
  try {
    await testRunner.runChildren(rootTestItem.children);
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
