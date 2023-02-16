/**
 * @module projectModule
 *
 * when Import Helper looks for a module, it searches in two separate lists to come up with the results:
 *
 *    1. {@link Project.sourceModules} - a list of modules that are part of the project's source files.  These
 *       files can be code, like .ts or .js, or other files used by the project, like .css, .ttf, or .png.
 *
 *    2. {@link Project.nodeModules} - modules residing somewhere in node_modules folder(s) associated with the project.
 *
 *
 *   the following class diagram represents the different types of modules tracked by Import Helper:
 *
 *              +----------------------------------------------------+
 *              |           abstract {@link ProjectModule}           |
 *              +----------------------------------------------------+
 *              | abstract class laying out basic details about      |
 *              | modules involved in the project.                   |
 *              |                                                    |
 *              | important properties:                              |
 *              | {@link ProjectModule.universalPathModuleSpecifier} |
 *              | {@link ProjectModule.isCode}                       |
 *              +----------------------------------------------------+
 *                 ^
 *                 |
 *                 |        +------------------------------------------------------+
 *                 |        |                {@link SourceModule}                  |
 *                 |        +------------------------------------------------------+
 *                 +--------+ a module that is part of the project's collection of |
 *                 |        | source files. These can be any kind of file imported |
 *                 |        | by the project including .ts,.js,.tsx,.jsx,.d.ts,    |
 *                 |        | .css,.ttf,.svg,.png, etc.                            |
 *                 |        |                                                      |
 *                 |        | a list of SourceModules imported by the project's    |
 *                 |        | code modules are at {@link Project.sourceModules}    |
 *                 |        +------------------------------------------------------+
 *                 |
 *                 |
 *                 |        +-----------------------------------------------------+
 *                 |        |                {@link NodeModule}                   |
 *                 |        +-----------------------------------------------------+
 *                 |        | a module used by the project that resides somewhere |
 *                 |        | in node_modules.  We don't know exactly where, so   |
 *                 +--------+ when needing to open the actual module's code,      |
 *                 |        | we'll go looking through the node_modules on disk   |
 *                 |        | to find it.                                         |
 *                 |        |                                                     |
 *                 |        | a list of NodeModules imported by the project's     |
 *                 |        | code modules are at {@link Project.nodeModules}     |
 *                 |        +-----------------------------------------------------+
 *                 |
 *                 |        +---------------------------------------------------------+
 *                 |        |             {@link SourceModuleImport}                  |
 *                 |        +---------------------------------------------------------+
 *                 +--------+ represents an import statement found in one of the      |
 *                 |        | source code modules.                                    |
 *                 |        |                                                         |
 *                 |        | a list of SourceModules imported by the project's       |
 *                 |        | code modules are at {@link Project.sourceModuleImports} |
 *                 |        +---------------------------------------------------------+
 *
 *                 |        +---------------------------------------------------------+
 *                 |        |             {@link SourceSymbolImport}                  |
 *                 |        +---------------------------------------------------------+
 *                 +--------+ represents a symbol import found in one of the          |
 *                          | source code modules.                                    |
 *                          |                                                         |
 *                          | a list of SourceModules imported by the project's       |
 *                          | code modules are at {@link Project.sourceSymbolImports} |
 *                          +---------------------------------------------------------+
 *
 */

import * as vscode from 'vscode';
import * as ss from './common/systemSupport';
import { docs } from './document';
import { Project } from './project';
import * as vs from './common/vscodeSupport';
import * as cs from './common/collectionSupport';
import * as as from './appSupport';
import { ImportKind } from './importStatementParser';
import * as nodePath from 'path';
import * as ns from './common/nodeSupport';


/**
 * contains values describing the module which are suitable for display to the user.  That is, they are
 * based on the module the user is working on, and on the user's code module extension preferences.
 */
interface ModuleDescription {
  /** if coming from a source code module, this is relative to the current module, otherwise relative to node_modules */
  moduleSpecifier:as.ModuleSpecifierJuggler,
  /** the module name which considers the user's code module extension preferences */
  moduleNameForDisplay:string,
  /** the path to the module. Includes a special format if coming from node_modules. */
  modulePathForDisplay:string,
}


/**
 * lays out the basic details about a module involved in the project.
 */
export abstract class ProjectModule {
  private _universalPathModuleSpecifier: string = '';
  private _universalPathShortenedModuleSpecifier = '';
  private _ext: string = '';
  private _isCode: boolean = false;
  private _codeModuleHasIndex: boolean = false;
  private _symbolQuality:number = 0;
  public lastUsedDate: Date | undefined;

  /** indicates that this is a code module (`.ts, .tsx, .js, .jsx, .svelte etc.`) */
  public get isCode(): boolean {
    return this._isCode;
  }

  /** stores the actual extension of the module file if it's known (`.d.ts, .ts, .tsx, .js, .jsx, .css, .html, etc...`) */
  public get ext(): string {
    return this._ext;
  }

  /** indicates whether or not the code module is an `/index.js` file */
  public get codeModuleHasIndex(): boolean {
    return this._codeModuleHasIndex;
  }

  public get symbolQuality(): number {
    return this._symbolQuality;
  }

  public get isSvelte():boolean {
    return as.isSvelteFile( this.universalPathModuleSpecifier);
  }

  /**
   * a full absolute path + module name (unless it's in node_modules, then a short specifier is allowed).
   * Examples of universalPathModuleSpecifiers:
   *- `c:/projects/importHelper/common/systemSupport.ts`
   *- `/projects/importHelper/common/systemSupport.ts`
   *- `/projects/importHelper/common/plainQuickPick.ts`
   *- `electron`
   *- `/projects/importHelper/style.css`
   */
  public get universalPathModuleSpecifier(): string {
    return this._universalPathModuleSpecifier;
  }
  public set universalPathModuleSpecifier(value: string) {
    let moduleSpecifierJuggler = new as.ModuleSpecifierJuggler(value);
    this._universalPathModuleSpecifier = value;
    this._universalPathShortenedModuleSpecifier = moduleSpecifierJuggler.shortenedModuleSpecifier;
    this._isCode = moduleSpecifierJuggler.isCode;
    this._ext = moduleSpecifierJuggler.ext;
    this._codeModuleHasIndex = moduleSpecifierJuggler.hasIndex;
    this._symbolQuality = as.cHiddenCodeExtensionsRank.length - as.getExtRankByExt(this.ext);
  }

  /**
   * The a shortened module name is achieved by removing the code file extensions and /index
   * if they exist. (ex. `systemSupport.ts` becomes `systemSupport`)
   * Use this as the least common denominator for all the ways that a code module's specifier can be expressed.
   * Sometimes import statements will include a `.js`, or a `/index.js`.  In order to find it in quickly in
   * {@link Project.sourceModules} & {@link Project.nodeModules} we first shorten it, then use it as a key in those maps.
   */
  public get universalPathShortenedModuleSpecifier() {
    return this._universalPathShortenedModuleSpecifier;
  }

  /**
   * gets the module name from the {@link universalPathShortenedModuleSpecifier}. (i.e. without /index or optional code extensions when it's a code module)
   */
	public get shortenedModuleName():string {
    return ss.extractFileName(this.universalPathShortenedModuleSpecifier);
	}

  /**
   * gets the module name from the {@link universalPathModuleSpecifier}. (i.e. without /index or extensions when it's a code module)
   */
	public get moduleName():string {
    return ss.extractFileName(this.universalPathModuleSpecifier);
	}

  public get isTest() {
    return as.isTestModule(this.shortenedModuleName);
  }

}


export class SourceModule extends ProjectModule {
	/**
	 * the quality of the symbols contained in the module. (Higher is better.) This is used to decide which module files of the same name have precedence. For example, *.d.ts, would have better symbols than a *.js file.
	 */
	public symbolQualityLevel: number = 0;

  constructor (
    public sourceModules:SourceModules
  ) {
    super();
  }

  public get usedByCount():number {
    let found = this.sourceModules.project.sourceModuleUsedBySourceModules.byKey1(this);
	  if (found)
      return found.key2Map.size;
    return 0;
  }


}



/**
 * holds a list of modules contained by a project.  The list is a map keyed on definitive module specifiers
 * - keys - {@link SourceModule.universalPathShortenedModuleSpecifier} (string) - i.e. the full path name to the module  (not to the actual module file, which could be an index.d.ts for example.)
 * - values - {@link SourceModule}
 *
 * ex. the following file `c:/myProject/src/myTools/index.d.ts` can be found using:
 *
 *   - `sourceModules.byUniversalPathShortenedModuleSpecifier('c:/myProject/src/myTools');`
 *
 */
export class SourceModules extends cs.FfMap<string,SourceModule> {
  public project: Project;
  private workspaceRoots:string[] = [];

  private excludeNonRootPaths:string[] = [];
  private excludeRootPaths:string[] = [];

	constructor(project: Project) {
		super();
    this.project = project;
	}

  public set(universalPathShortenedModuleSpecifier:string, sourceModule: SourceModule) {
		let foundSourceModule = this.byUniversalPathShortenedModuleSpecifier(universalPathShortenedModuleSpecifier);
    if (foundSourceModule)
			if (sourceModule.symbolQualityLevel <= foundSourceModule.value.symbolQualityLevel)
        return this;
    super.set(universalPathShortenedModuleSpecifier,sourceModule);
		return this;
	}

  public byUniversalPathShortenedModuleSpecifier(universalPathShortenedModuleSpecifier:string) {
    return this.byKey(universalPathShortenedModuleSpecifier);
  }

  public delete(universalPathShortenedModuleSpecifier:string):boolean {
    let found = this.byUniversalPathShortenedModuleSpecifier(universalPathShortenedModuleSpecifier);
    if (!found)
      return false;
    super.delete(universalPathShortenedModuleSpecifier);
    return true;
  }

  public addByModuleFile(moduleFile:string):SourceModule {
    let sourceModule = new SourceModule(this);
    sourceModule.universalPathModuleSpecifier = moduleFile;
    this.set(sourceModule.universalPathShortenedModuleSpecifier,sourceModule);
    return sourceModule;
  }

  /**
   * check if the file should be excluded based on the configuration's exclude paths.
   * This considers only the exclude paths that don't begin with a slash.
   */
  public isExcludedByNonRootPaths(file:string):boolean {
    file = file.toLowerCase();
    for (let path of this.excludeNonRootPaths)
      if (file.includes('/'+path+'/'))
        return true;
    return false;
  }

  /**
   * check if the file should be excluded based on the configuration's exclude paths.
   * This considers only the exclude paths that begin with a slash, which mean the path is meant to match from the workspace root.
   */
  public isExcludedByRootPaths(file:string):boolean {
    file = file.toLowerCase();
    for (let excludeRootPath of this.excludeRootPaths)
      for (let root of this.workspaceRoots) {
        let fullExcludeRootPath = ss.addPathEndSlash( ss.trimPathEndSlash(root) + excludeRootPath );
        if (file.startsWith(fullExcludeRootPath))
          return true;
      }
    return false;
  }

  /**
   * initialize workspaceRoots, excludePaths, and excludeRootPaths
   */
  private initPaths() {
    if (vscode.workspace.workspaceFolders)
      this.workspaceRoots = vscode.workspace.workspaceFolders.map( folder => ss.addPathEndSlash(ss.forwardSlashes((folder.uri.fsPath).toLowerCase())) );
    else
      this.workspaceRoots.length = 0;

    let excludePathsConfig:string = as.getSetting('import-helper.paths','exclude','');
    this.excludeNonRootPaths.length = 0;
    this.excludeRootPaths.length = 0;
    let paths:string[] = excludePathsConfig.split(/(?<=[^\\]),\s*/);  // <-- matches ', ', or ',', but commas escaped with a backslash
    paths = paths.map( path => path.trim() );
    for (let path of paths) {
      if (path.startsWith('/'))
        this.excludeRootPaths.push(path.toLowerCase());
      else
        this.excludeNonRootPaths.push(path.toLowerCase());
    }
  }

  public clear(): void {
    super.clear();
  }


  async load() {
    this.clear();
    this.initPaths();

    // remove: all of this was simply to take advantage of the fact that typescript already scans the project to
    // gather the ambient modules based on tsconfig's include and exclude entries.  However, for projects that
    // don't use ambient modules, this was ignoring all of the modules the project really has access to. So instead
    // IH will scan for modules on its own.

    // if (this.project.config) {
    //   // if we have a config file, the *.ts files will already gathered for us by the typescript api
    //   for (let file of this.project.config.rawFiles) {
    //     file = ss.internalizeFile( file );
    //     if (!this.isExcludedByRootPaths( file ) && !this.isExcludedByPaths( file ) )
    //       this.addByModuleFile( file );
    //   }
    //   // we no longer need to keep the list of raw files around.
    //   this.project.config.clearRawFiles();

    // } else {
      // we'll have to get our own files
      // let foundURIs = await vscode.workspace.findFiles('**/'+vs.getWorkspaceRelativePath(this.project.projectPath)+'**/*{'+ss.commas(cCodeExtensions)+'}', '**/{node_modules'+ss.prefix(',',ss.commas(this.excludePaths))+'}/**');
      // for (let uri of foundURIs)
      //   if (! this.isExcludedByRootPaths( ss.internalizeFile(uri.fsPath) ) )
      //     this.addByModuleFile( ss.internalizeFile(uri.fsPath ) );
    // }

    // note: any changes to the code that limits the files included should also be reflected in Project.moduleContentChanged
    let allExtensions = ss.commas(...as.cCodeExtensions,...as.additionalExtensions);
    // note: vscode.workspace.findFiles takes care of excluding the non-root paths.
    let foundURIs = await vscode.workspace.findFiles('**/'+vs.getWorkspaceRelativePath(this.project.projectPath)+'**/*{'+allExtensions+'}', '**/{node_modules'+ss.prefix(',',ss.commas(this.excludeNonRootPaths))+'}/**');
    for (let uri of foundURIs)
      if (! this.isExcludedByRootPaths( ss.internalizeFile(uri.fsPath) ) ) // <-- exclude the root paths
        this.addByModuleFile( ss.internalizeFile(uri.fsPath ) );

  }

}

async function getSubModules(packageJsonFile:string) {
  let result:string[] = [];
  let json = await ns.readStringFromFile(packageJsonFile);
  let packageObject = JSON.parse(json);
  let exports = packageObject.exports;
  if (typeof exports == 'object') {
    for (let item in exports) {
      if (item.startsWith('./') && typeof exports[item]['types'] == 'string')
        result.push(item.substring(2));
    }
  }
  return result;
}


export class NodeModule extends ProjectModule {
  constructor(
    public nodeModules:NodeModules
  ){
    super();
  }

  public get usedByCount():number {
    let found = this.nodeModules.project?.nodeModuleUsedBySourceModules.byKey1(this);
	  if (found)
      return found.key2Map.size;
    return 0;
  }

}

/**
 * a map of definitive module specifiers to NodeModule
 */
export class NodeModules extends cs.FfMap<string,NodeModule> {
  public isLoading:boolean = false;
  public wasNew:boolean = false;

	constructor(
    public project: Project | null = null
  ) {
		super();
	}

  /**
   * used for adding node modules when scanning source modules
   */
  public add(nodeModule:NodeModule) {
    this.wasNew = false;
    if (! this.byKey(nodeModule.universalPathShortenedModuleSpecifier) ) {
      this.wasNew = true;
      this.set(nodeModule.universalPathShortenedModuleSpecifier,nodeModule);
    }
  }

  /**
   * used when opening Import Helper to load a list of modules on the fly
   */
  public async load( tempInsertPos:number, onLoadingMilestone:(finalMilestone?:boolean)=>void ): Promise<void> {
    if (!this.project)
      throw new Error('NodeModules.load(): NodeModules.project must be assigned.');

    if (this.isLoading)
      return;
    this.isLoading = true;
    try {

      this.clear();

      // since we need to actually simulate adding an import statement to the current file to get the node_modules, the current file must be a code file.
      if (! docs.active?.isCode)
        return;

      let completions = await vs.getCompletions('import {} from \'', '\'; ', tempInsertPos);

      for (let comp of completions) {
        if (comp.kind == vscode.CompletionItemKind.Module) {
          let nodeModule = new NodeModule(this);
          nodeModule.universalPathModuleSpecifier = (typeof comp.label == 'string' ? comp.label : comp.label.label);
          this.set(nodeModule.universalPathShortenedModuleSpecifier,nodeModule);
        }
      }

      // however, sometimes vscode does not offer all of the node_modules that are available to be imported, and we need to dig deeper for certain modules.
      for (let [module] of this) {
        if (!module.includes('/')) {
          for (let nodeModulesPath of this.project.nodeModulesPaths) {
            let packageJson = `${nodeModulesPath}${module}/package.json`;
            if (await ns.fileExists(packageJson)) {
              let subModules = await getSubModules(packageJson);
              for (let subModule of subModules) {
                let nodeModule = new NodeModule(this);
                nodeModule.universalPathModuleSpecifier = module+'/'+subModule;
                this.set(nodeModule.universalPathShortenedModuleSpecifier,nodeModule);
              }
            }
            break; // <-- found the package.json
          }
        }
      }

    } finally {
      this.isLoading = false;
      onLoadingMilestone(true);
    }

	}

}


/**
 * contains the data for a full module import statement used by one or more sourceModules in the project.  Don't get this confused with
 * {@link './importStatementParser'.ImportStatementParser}.
 */
export class SourceModuleImport extends ProjectModule {
  public alias: string = '';
  public importKind: ImportKind = ImportKind.moduleOnly;

  constructor(
    public sourceModuleImports:SourceModuleImports
  ) {
    super();
  }

  public get key(): string {
    return (this.universalPathShortenedModuleSpecifier + '*' + this.alias + '*' + this.importKind);
  }

  public get usedByCount():number {
    let found = this.sourceModuleImports.project.sourceModuleImportUsedBySourceModules.byKey1(this);
	  if (found)
      return found.key2Map.size;
    return 0;
  }

	public get aliasOrShortenedModuleName(): string {
		return ss.ifBlank(this.alias, this.shortenedModuleName);
  }

}

/**
 * contains a list of Project Imports that were used by various modules in the project.  This differentiates
 * between `import * as alias from 'module'`, `import alias from 'module'` and `import 'module'`.  If the user
 * prefers to use one style over another, Import Helper remembers it and offers it as an option when searching
 * for modules.
 */
export class SourceModuleImports extends cs.FfSortedMap<string, SourceModuleImport> {
  public wasNew: boolean = false;

  constructor(
    public project:Project
  ) {
    super();
  }

  /**
   * finds all of the imports that use the definitiveModuleSpecifier.  There could
   * be multiple, such as:
   * ```
   *   import * as ss from 'common/systemSupport';
   *   import { L } from 'common/systemSupport';
   *   import 'common/systemSupport';
   * ```
   */
  public allByUniversalPathShortenedModuleSpecifier(universalPathShortenedModuleSpecifier: string): SourceModuleImport[] {
    let items: SourceModuleImport[] = [];
    let found = this.byKeyParts(universalPathShortenedModuleSpecifier);
    if (!found)
      return items;
    let index = found.index;
    while ( found = this.byIndex(index++) )
      if (found.key.startsWith(universalPathShortenedModuleSpecifier + '*'))
        items.push(found.value);
    return items;
  }

  public byKeyParts(universalPathShortenedModuleSpecifier: string, alias: string = '', aliasKind?: ImportKind) {
    return this.byPartialKey(universalPathShortenedModuleSpecifier + '*' + ss.suffix(alias, '*') + (aliasKind ?? ''));
  }

  public add(projectModuleImport:SourceModuleImport) {
    this.set(projectModuleImport.key, projectModuleImport);
  }

}


export class SourceSymbolImport extends ProjectModule {
  public name: string = '';
  public alias: string = '';

  constructor(
    public sourceSymbolImports:SourceSymbolImports
  ) {
    super();
  }

  public get key(): string {
    return (this.universalPathShortenedModuleSpecifier + '*' + this.name + '*' + this.alias);
  }

  public get usedByCount():number {
    let found = this.sourceSymbolImports.project.sourceSymbolImportUsedBySourceModules.byKey1(this);
	  if (found)
      return found.key2Map.size;
    return 0;
  }

}


/**
 * contains a list of Project Symbols that were used by various modules in the project.  This differentiates
 * between `import {symbol} from 'module'`, and `import {symbol as alias} from 'module'`.  If the user
 * prefers to use a symbol alias, Import Helper remembers it and offers it as an option when searching
 * for symbols.
 */
export class SourceSymbolImports extends cs.FfSortedMap<string, SourceSymbolImport> {
  public wasNew: boolean = false;

  constructor(
    public project:Project
  ) {
    super();
  }

  /**
   * finds all of the symbols that are imported in the project by the definitiveModuleSpecifier and symbol name.
   * Note that the same symbol can be imported multiple times under different aliases:
   * ```
   *   import { extractFilePath } 'common/systemSupport';
   *   import { extractFilePath as efp } from 'common/systemSupport';
   * ```
   */
  public allByUniversalPathShortenedModuleSpecifierAndName(universalPathShortenedModuleSpecifier: string, name:string): SourceSymbolImport[] {
    let items: SourceSymbolImport[] = [];
    let found = this.byKeyParts(universalPathShortenedModuleSpecifier,name);
    if (!found)
      return items;
    let index = found.index;
    while ( found = this.byIndex(index++) )
      if (found.key.startsWith(universalPathShortenedModuleSpecifier + '*' + name + '*'))
        items.push(found.value);
    return items;
  }

  public byKeyParts(universalPathShortenedModuleSpecifier: string, name: string = '', alias: string = '') {
    return this.byPartialKey(universalPathShortenedModuleSpecifier + '*' + ss.suffix(name, '*') + alias);
  }

  public add(projectSymbol:SourceSymbolImport) {
    this.set(projectSymbol.key, projectSymbol);
  }

}
