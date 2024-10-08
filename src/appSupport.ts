/**
 *
 *
 * ##module specifiers
 *
 * module specifiers indicate the location of a module.  Since Import Helper has slightly expaned the
 * meaning of "module" to include anything that an import statement can import, "module specifier"
 * actually means the location of anything an import statement can import.  A file containing actual
 * javascript/typescript/svelte code will be referred to as a "code module".
 *
 * module specifiers are the things inside the quotes in the example below:
 * ```
 * import * as myModule from '../myModule.js';
 * import * as anotherModule from './anotherModule';
 * import * as commonModule from 'common/commonModule.js';
 * import * as yetAnotherModule from './yetAnotherModule/index.js';
 * import * as rootModule from '/not/common/myRootModule';
 * import * as electron from 'electron';
 * import appCss from './app.css';
 * ```
 * notice that multiple module specifiers can point to the same physical module, but have different ways
 * of getting there.  The differences come in two forms:
 * 1. path type differences
 * 2. file name ending differences
 *
 * 1. path type differences:
 *   a. absolute: `'/not/common/myRootModule'` - this is not used in actual import statements found in js/ts project code,
        but it is used internally by Import Helper to provide a common way of cataloging modules.
 *   b. relative to importing module: ex. '../myModule.js'
 *   c. relative to XXconfig.json: relative to tsconfig.json-->baseURL, or tsconfig.json-->paths: ex. 'common/commonModule.js'
 *   d. relative to node_modules: ex. 'electron'
 *      (c. & d. are referred to as "non-relative" paths by official typescript docs. Perhaps a better term would be "searchable path".)
 *
 * 2. file name ending differences:
 *   a. shortened: this is when the file name has its code file extension removed (like, `.ts, .js, .tsx, .jsx, etc.`) and has the
 *      `/index` removed if it was present.  For example, `./yetAnotherModule/index.js` can be shortened to `./yetAnotherModule`
 *   b. non-shortened: this when all endings are included for code modules. Note that non-code modules like
 *      `.css, .png, .ttf, etc.` will never be shortened.
 *
 * Import Helper handles many forms of module specifiers, therefore variable naming conventions in the source code for those specifiers are as follows:
 *
 * - `anyModuleSpecifier`: can contain any module specifier; it may be relative, searchable or absolute, and shortened or non-shortened
 *
 * - `absoluteModuleSpecifier`: a fully absolute & non-shortened specifier ex. `c:/myProject/src/myModule.js`,
 *
 * - `nodeRelativeModuleSpecifier`: a non-shortened specifier relative to node_modules ex. `electron`
 *
 * - `universalPathModuleSpecifier`: non-shortened specifier containing either an absoluteModuleSpecifier or a nodeRelativeModuleSpecifier
 *
 * - `absoluteShortenedModuleSpecifier`: absolute, but shortened if possible: ex. `c:/myProject/src/myModule` or 'c:/myProject/src/styles.css'
 *
 * - `nodeRelativeShortenedModuleSpecifier`: nodeRelative, and shortened: ex. `electron`, Note that extensions are rarely used (if ever)
 *   to refer to modules inside node_module packages, but this allows for the possibility just in case.
 *
 * - `universalPathShortenedModuleSpecifier`: the best definitive path to the module -- and shortened ex. `c:/myProject/src/myModule` or 'electron'
 *
 */


/*

  SourceModule       -- represents a module that is part of the project source code and required files. Since this represents
                        a physical location, an absolute path can be known.  Also, this needs to be searched on, so the
                        endings must be shortened when storing the key.
    absoluteModuleSpecifier (key: absoluteShortenedModuleSpecifier)

  NodeModule         -- represents a module that is available to the project via node_modules.  Since node_modules isn't one
                        folder in a specific location, but rather a possible tree of multiple folders, this only keeps track
                        of a relative path. Since this needs to be searched on, the endings will be shortened when creating
                        a key. (But code module file extensions seem to be rare, or maybe even never used with node_modules packages.)
    nodeRelativeModuleSpecifier (key: nodeRelativeShortenedModuleSpecifier)

  ImportStatement    -- represents the code of an import statement, as such it only ever knows what module specifier is
                        being used in the statement itself, and that can be any kind of module specifier.  When building
                        an ImportStatement to output the text of the actual statement, whatever module specifier is
                        supplied will appear in the statement.
    moduleSpecifier

  ProjectModuleImport -- represents an import statement found in the project's source code that imports the entire module.
                         (either as a default alias, an "all alias", or a straight import without any symbols or alias).  Since
                         this is mainly used in internal searches it only needs to know about the universalPathlModuleSpecifier.
                         When storing the key it will be shortened.
    universalPathModuleSpecifier: (key: universalPathShortenedModuleSpecifier)

  ProjectSymbolImport -- represents a symbol from an import statement found in the project's source code.  Since this is mainly used in
                         internal searches it only needs to know about the universalPathlModuleSpecifier.  When storing the key
                         it will be shortened.
    universalPathModuleSpecifier: (key: universalPathShortenedModuleSpecifier)


  SourceModuleQuickPickItem -- holds a pointer to the SourceModule and displays it for the user.  The label comes from the
                               module name, which can take a two forms:
                                 1. the module name without an extension
                                 2. the module name with an extension
                                 (it will never be 'index')
                               The description is usually the shortest relative way to reach the absoluteModuleSpecifier's
                               path from the path of the importing module.  If the user wants to show indexes, then this will
                               actually include a /index.js at the end.

                               This also gets an importModuleLocator calculated for placing in the importing module. ex:
                               import * as whatever from '<importModuleLocator>'.  This is based on the calculation used for
                               the description.


  NodeModuleQuickPickItem  -- holds a pointer to the NodeModule and displays it to the user.  The label is simply the
                              module name, which usually doesn't include extensions, but we'll use the same logic as
                              SourceModuleQuickPickItem regarding the label.  The description is the path, with a
                              '(node_modules)' in front of it. Since the path is usually empty, it's usually just
                              '(node_modules)'.


  ProjectModuleImportQuickPickItem -- holds a pointer to a ProjectModuleImport and displays it to the user. The label
                                      is the entire import string as it would appear if the user decided to import it
                                      into the current module.  It takes into account all of the preferences vscode
                                      has set for styling automatic imports. (single or double quotes, padding, semicolons,
                                      path type, file extensions, etc.)  The description is left blank.

  ProjectSymbolImportQuickPickItem -- holds a pointer to a ProjectSymbolImport and displays it to the user. The label
                                      is the symbol name and optional symbol alias in braces.  The description is usually the
                                      shortest relative way to reach the universalModuleSpecifier's path from the path of the
                                      importing module.  If the user wants to show indexes, then this will actually include
                                      a /index.js at the end.


 */

import * as ss from './common/systemSupport';
import * as as from './appSupport';
import * as cs from './common/collectionSupport';
import * as vscode from 'vscode';
import { docs } from './document';
import * as ns from './common/nodeSupport';
import { Token, TK } from './token';
export const cAppName = 'Import Helper';

export const cGoToImportsBodyPos = 'goToImportsBodyPos';
export const cLastImportPos = 'lastImportPos';

export const cJavascriptExtensions = new cs.FfArray(
  '.mjs','.cjs','.js',
  '.mjsx','.cjsx','.jsx'
);
export const cTypescriptExtensions = new cs.FfArray(
  '.d.mts','.d.cts','.d.ts',
  '.mts','.cts','.ts',
  '.mtsx','.ctsx','.tsx'
);
export const cReactExtensions = new cs.FfArray(
  '.mtsx','.ctsx','.tsx',
  '.mjsx','.cjsx','.jsx'
);
export const cSvelteExtensions = new cs.FfArray('.svelte');
export const cCodeExtensions = new cs.FfArray(...cJavascriptExtensions,...cTypescriptExtensions,...cSvelteExtensions);
export const cHiddenCodeExtensionsRank = new cs.FfArray(  // <-- used for checking for these extensions when none are specified in import statements
  '.d.cts','.d.ts',
  '.cts','.ts',
  '.ctsx','.tsx',
  '.cjs','.js',
  '.cjsx','.jsx'
);
export const cNonHiddenCodeExtensions = new cs.FfArray('.mts','.mjs','.svelte');
export const cTestExtensions = new cs.FfArray('.test','.spec');

export const cUnknownFileIcon = 'output';
export const cCodeModuleIcon = 'file-text';
export const cReactModuleIcon = 'file-code';
export const cSvelteModuleIcon = 'file-code';
export const cTestModuleIcon = 'beaker';
export const cNodeModuleIcon = 'package';
export const cNonCodeModuleFileIcons = new Map<string,string>(
	[
		['.htm','code'],
		['.html','code'],
		['.css','paintcan'],
		['.scss','paintcan'],
    ['.sass','paintcan'],
		['.jpg','device-camera'],
		['.png','device-camera'],
		['.gif','device-camera'],
		['.svg','device-camera'],
    ['.ttf','text-size'],
    ['.otf','text-size'],
    ['.woff','text-size'],
    ['.woff2','text-size'],
	]
)

export let additionalExtensions = new cs.FfArray<string>();

export function isTypescriptFile(fileOrFileName:string):boolean {
  return Boolean( cTypescriptExtensions.byFunc( ext => fileOrFileName.endsWith(ext) )  );
}
export function isSvelteFile(fileOrFileName:string) {
  return Boolean( cSvelteExtensions.byFunc( ext => fileOrFileName.endsWith(ext) )  );
}

export function isReactModule(fileOrFileName:string) {
  return Boolean( cReactExtensions.byFunc( ext => fileOrFileName.endsWith(ext) )  );
}

export function isCodeFile(fileOrFileName: string): boolean {
  return Boolean( cCodeExtensions.byFunc( ext => fileOrFileName.endsWith(ext) )  );
}

export function isAdditionalExtensionFile(fileOrFileName: string): boolean {
  return Boolean( additionalExtensions.byFunc( ext => fileOrFileName.endsWith(ext) )  );
}

/**
 * @path path for the "folder" of settings in the vscode config file. ex. 'import-helper.extensions'
 * @setting the actual setting item. ex. 'additional'
 * @defaultValue return this if the setting doesn't exist
 * @uri context for the setting (for example, .ts files may have different settings than .css files) the currently active document is used if not specified
 */
export function getSetting<T>(path:string, setting:string, defaultValue:T, uri?:vscode.Uri):T {
  if (!uri)
    uri = docs.active?.vscodeDocument?.uri;
  return vscode.workspace.getConfiguration(path,uri).get<T>(setting) ?? defaultValue;
}

export function initConfiguration() {
  let additionalExtensionsSetting = getSetting('import-helper.extensions','additional','');
  let additionalExtensionsArray = additionalExtensionsSetting.split(',');
  additionalExtensionsArray = additionalExtensionsArray.map( ext => ss.prefix('.',ss.removePrefix( ext.trim() ,'.')));
  additionalExtensions = new cs.FfArray(...additionalExtensionsArray);
}

/**
 * since module specifiers can be shortened to omit any code extensions or the use of /index, this class is used to store them in their shortened
 * form.  Most of the time, import statements use shortened specifiers and therefore we'll have to look them up in our internal list of specifiers without
 * extensions. So, we always shorten specifiers before storing them, that way our data contains the least common denominator for searching.
 *
 * @member shortenedModuleSpecifier does not include `/index` or code file extensions such as `.js, .ts,` etc.  It will include any extensions
 * used by other files, such as .css, .png, .ttf, etc.  Important: "shortened" only pertains to the ending of the specifier, not the path part.
 * @member ext contains the code file extension for code files (`.js, .ts,` etc.)
 * @member usesIndex indicates if the specifier uses a `/index`. (/lib/numberSupport/index.js)
 */
export class ModuleSpecifierJuggler {
  public shortenedModuleSpecifier:string = '';
  public hasIndex:boolean = false;
  public ext:string = '';
  private _isCode: boolean;
  private _isShortened: boolean;

  constructor(nonShortenedModuleSpecifier:string) {
    this._isCode = false;
    this._isShortened = false;
    this.shortenedModuleSpecifier = nonShortenedModuleSpecifier;
    this.ext = as.extractCodeExt(this.shortenedModuleSpecifier);
    if (this.ext) {
      this._isCode = true;
      //check if the module is in the form:  moduleName/index.*
      let p = this.shortenedModuleSpecifier.lastIndexOf('/');
      if (p > -1 && this.shortenedModuleSpecifier.substr(p,7) == '/index.') {
        this.hasIndex = true;
        this.shortenedModuleSpecifier = this.shortenedModuleSpecifier.substring(0,p);
      } else {
        // see if we need to strip the extension (we usually do)
        if (!cNonHiddenCodeExtensions.includes(this.ext)) {
          this.shortenedModuleSpecifier = this.shortenedModuleSpecifier.substring(0,this.shortenedModuleSpecifier.length - this.ext.length);
          this._isShortened = true;
        }
      }
    } else
      this.ext = ss.extractFileExt(this.shortenedModuleSpecifier);

    if (this.ext == '') {
      this._isCode = true; // <-- must assume this is a code module if we don't have any extension
      this._isShortened = true; // <-- and we'll assume it's shortened
    }
  }

  public get nonShortenedModuleSpecifier() {
    return this.asString({includeIndex:true, includeExt:true});
  }

  /**
   * indicates if the module is an actual code module (typescript, javascript, tsx, jsx, or svelte)
   */
  public get isCode():boolean {
    return this._isCode;
  }

  public get isShortened():boolean {
    return this._isShortened;
  }

  public asString(params:{includeIndex:boolean, includeExt:boolean}) {
    return this.shortenedModuleSpecifier + (params.includeIndex && this.hasIndex ? '/index' : '') +  (params.includeExt && this.isShortened ? this.ext : '');
  }
}

export let preferences = {
  symbolSpacing: true,
  moduleSpecifierEnding: 'auto',
  moduleSpecifierPath: 'auto'
}

/*
  test modules end with .test or .spec after their code extension has been stripped
*/
export function isTestModule(moduleNameWithOrWithoutExt:string) {
  let codeExt = as.extractCodeExt(moduleNameWithOrWithoutExt);
  let shortenedModuleName = moduleNameWithOrWithoutExt.substring(0,moduleNameWithOrWithoutExt.length - codeExt.length);
  let ext = ss.extractFileExt(shortenedModuleName);
  return cTestExtensions.includes(ext);
}

export function getModuleIcon(nonShortenedModuleName:string, isCodeModule:boolean, isNodeModule:boolean):string {
  if (isNodeModule)
    return cNodeModuleIcon;

  if (isCodeModule) {
    if (isTestModule(nonShortenedModuleName))
      return cTestModuleIcon;

    let codeExt = extractCodeExt(nonShortenedModuleName).toLowerCase();

    if (cReactExtensions.includes(codeExt))
      return cSvelteModuleIcon;

    if (cSvelteExtensions.includes(codeExt))
      return cSvelteModuleIcon;

    return cCodeModuleIcon;
  }

  let ext = ss.extractFileExt(nonShortenedModuleName);
  return cNonCodeModuleFileIcons.get(ext) ?? cUnknownFileIcon;
}

export function makeValidSymbolName(badSymbolName:string):string {
  // remove everything except alpha numeric, - and _
  let result = badSymbolName.replace(/([^A-Za-z0-9-_])/g, char => '_');

  // camel case it where needed
  result = ss.camelCase(result);

  // remove leading numbers
  result = result.replace(/(^[0-9]*)/g, digit => '');

  return result;
}

/**
 * ranks the file by the extension.  Lower is better.
 */
export function getExtRankByFile(lowerCaseFile:string):number {
	for (let [i, ext] of cHiddenCodeExtensionsRank.entries()) {
		if (lowerCaseFile.endsWith(ext))
		  return i;
	}
	return cHiddenCodeExtensionsRank.length;
}

export function getExtRankByExt(lowerCaseExtension:string):number {
  lowerCaseExtension = ss.trimStartChars(lowerCaseExtension,['.']);
  let result = cHiddenCodeExtensionsRank.indexOf(lowerCaseExtension);
	return (result = -1 ? cHiddenCodeExtensionsRank.length : result);
}

/**
 * returns the location of the global mode_modules intalled somewhere in the OS
 * @todo: I'm not sure about this...  Firstly, this is not only in a different place on every type of OS, but
 * the user could be using yarn, which I think installs its global packages in it's own location.
 */
export async function getGlobalNodeModulesPath():Promise<string> {
  return ss.internalizePath('');
}

export function getHiddenCodeExtPos(file:string):number {
	for (let ext of cHiddenCodeExtensionsRank) {
		if (file.endsWith(ext))
		  return file.length - ext.length;
	}
	return -1;
}


/**
 * given an `importingModuleFile`, this returns all of the node_module folders that exist in its parent tree. ex.:
 *
 * for example, if we have this file tree:
 * - 🗀 src/
 * -   🗀 project/
 * -      🗀 node_modules/
 * -      🗎 app.ts
 * -   🗀 node_modules/
 *
 * when `importingModuleFile` is `/src/project/app.ts`, this returns `['/src/project/node_modules/','/src/node_modules/']`
 */
export async function getNodeModulePaths(importingModuleFile: string) {
  let result:string[] = [];
  let testPath = ss.extractPath(importingModuleFile);
  while (testPath != '') {
    let testNodeModules = testPath+'node_modules/';
    if (await ns.pathExists(testNodeModules))
      result.push(testNodeModules);
    if (ns.isRoot(testPath))
      break;
    testPath = ss.extractPath(testPath);
  }
  return result;
}




export function extractCodeExt(file: string) {
  for (let ext of cCodeExtensions) {
    if (file.endsWith(ext))
      return ext;
  }
  return '';
}

export function deriveModuleNameAlias(shortenedModuleName: string) {
  if ( as.cNonHiddenCodeExtensions.includes(ss.extractFileExt(shortenedModuleName)) )
    shortenedModuleName = ss.removeFileExt(shortenedModuleName);
  return as.makeValidSymbolName(shortenedModuleName);
}



/** represents a javascript/typescript identifier */
export class Identifier {
  /** text of the identifier */
  public text:string = '';
  /** represents a javascript/typescript identifier */
  public isDefinitelyASymbol: boolean = false;
  /** position the identifier was found in the document */
  public startPos:number = 0;
}


/**
 *  returns a symbol suitable for using as the default string in an Add Import module search
 */
export function getSearchIdentifierNearCursor(params:{
  sourceLine: string,
  sourceLineStartPos: number,
  lineCursorPos: number
}): Identifier | undefined {

  // parse all the tokens and find the identifier under or to the left of the cursor
  let theIdentifier = '';
  let token = new Token();
  let lastTokenKind = TK.Unknown;
  let lastIdentifier = new Identifier();
  let inLeftOfInstanceAssignmet = false;
  token.sourceCode = params.sourceLine;
  token.getNext();
  while (token.kind != TK.EndOfFileToken) {
    if ([TK.LetKeyword, TK.ConstKeyword, TK.VarKeyword].includes(token.kind)) {
      inLeftOfInstanceAssignmet = true;
    } else if (token.kind == TK.EqualsToken) {
      inLeftOfInstanceAssignmet = false;
    } else if (token.kind == TK.Identifier && !inLeftOfInstanceAssignmet) {
      // determine if it's a good candidate.
      let precedingCharacter = params.sourceLine.substr(token.sourcePos-token.text.length-1,1);
      if (precedingCharacter != '.') {
        lastIdentifier.text = token.text;
        lastIdentifier.startPos = params.sourceLineStartPos + token.startPos;
        lastIdentifier.isDefinitelyASymbol = false;
        let followingCharacter = params.sourceLine.substr(token.sourcePos,1);
        if (followingCharacter == '[' || followingCharacter == '(')
          lastIdentifier.isDefinitelyASymbol = true;
      }
    }
    if (params.lineCursorPos >= token.startPos && params.lineCursorPos <= token.endPos+1) {
      break;
    }
    lastTokenKind = token.kind;
    token.getNext();
  }

  if (lastIdentifier.text == '')
    return;

  return lastIdentifier;

}
