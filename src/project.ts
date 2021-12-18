/**
 * @module project
 * maintains a collection of projects available in the workspace. A project is defined as all the files and folders under a
 * workspace folder containing a tsconfig.json, jsconfig.json, or a package.json file.
 *
 * This module and the {@link ./projectModule.ts} is the core of the extension.
 *
 * Before trying to understand this module, please review the notes about file names, file paths, module names, and
 * module paths in the developer's manual {@link ../../../docs/importHelperDevelopersManual.md}
 *
 *
 *   Diagram of important objects and collections:
 *
 *                                            object diagram (arrows point to object being used)
 *     +----------------------------------------------------------------------------------------------------------------------------------+
 *     |                                                           Project                                                                |
 *     |                                                       {@link Project}                                                            |
 *     +----------------------------------------------------------------------------------------------------------------------------------+
 *     |                                                                                                                                  |
 *     |                                                                                                                                  |
 *     |                                              +--------------------------------+                                                  |
 *     |                                              |  sourceModules: SourceModules  |                                                  |
 *     |                                              | {@link Project.sourceModules}: | <--------------+                                 |
 *     |                                              |     {@link SourceModules}      |                |                                 |
 *     |                                              +-----------+-----+---+-----+----+                |                                 |
 *     |                                                          |     |   |    |                      +                                 |
 *     |                                                          |     |   |    +-----------> #sourceModuleUsedBySourceModules           |
 *     |                                                          |     |   |          {@link Project.sourceModuleUsedBySourceModules}    |
 *     |                                                          |     |   |                                                             |
 *     |                                                          |     |   |                                                             |
 *     |                                                          |     |   |                                                             |
 *     |         nodeModuleUsedBySourceModules <------------------+     |   +------------------> sourceModuleImportUsedBySourceModules    |
 *     |      {@link Project.nodeModuleUsedBySourceModules}             |          {@link Project.sourceModuleImportUsedBySourceModules}  |
 *     |                 +                                              |                                                         +       |
 *     |                 |                                              |                                                         |       |
 *     |                 |                                              |                                                         |       |
 *     |                 |      +----------------------------+          |     +--------------------------------------------+      |       |
 *     |                 |      |  nodeModules: NodeModules  |          |     | sourceModuleImports: SourceModuleImports   |      |       |
 *     |                 +----> |{@link Project.nodeModules}:|          |     |   {@link Project.sourceModuleImports}:     | <----+       |
 *     |                        |    {@link NodeModules}     |          |     |       {@link SourceModuleImports}          |              |
 *     |                        +----------------------------+          |     +--------------------------------------------+              |
 *     |                                                                |                                                                 |
 *     |                                                                |                                                                 |
 *     |                                                                |                                                                 |
 *     |                                                                +-------------> sourceSymbolImportUsedBySourceModules             |
 *     |                                                                         {@link Project.sourceSymbolImportsUsedBySourceModules}   |
 *     |                                                                                                                         +        |
 *     |                                                                                                                         |        |
 *     |                                                                                                                         |        |
 *     |                                                                     +--------------------------------------------+      |        |
 *     |                                                                     | projectSymbolImports: SourceSymbolImports  |      |        |
 *     |                                                                     |    {@link Project.sourceSymbolImports}:    | <----+        |
 *     |                                                                     |        {@link SourceSymbolImports}         |               |
 *     |                                                                     +--------------------------------------------+               |
 *     |                                                                                                                                  |
 *     |                                                                                                                                  |
 *     +----------------------------------------------------------------------------------------------------------------------------------+
 */

import { SourceModules, SourceModule, NodeModules, NodeModule } from './projectModule';
import * as ss from './common/systemSupport';
import * as vs from './common/vscodeSupport';
import * as path from 'path';
import { Module } from './moduleParser';
import * as vscode from 'vscode';
import { ProjectConfig } from './projectConfig';
import { ImportKind } from './importStatementParser';
import { getGlobalNodeModulesPath, getExtRankByFile, cCodeExtensions } from './appSupport';
import * as cs from './common/collectionSupport';
import { SourceSymbolImport, SourceSymbolImports } from './projectModule';
import { ProjectWatcher } from './projectWatcher';
import * as as from './appSupport';
import { SourceModuleImports, SourceModuleImport } from './projectModule';
import { docs } from './document';

/**
 * contains all of the details pertaining to a project, such as configuration info from `package.json`,
 * `tsconfig.json`, and `jsconfig.json` as well as details about all of the modules available in the project.
 */
export class Project {
  public isLoading:boolean = true;
  public projectWatcher = new ProjectWatcher(this);
  private _isDirty:boolean = false;

  /**
   * set this when the project needs to be rescanned and built from scratch
   */
  public get isDirty():boolean {
    return this._isDirty;
  }

  public set isDirty(value:boolean) {
    if (this._isDirty == value)
      return;
    this._isDirty = value;
    if (this._isDirty)
      this.projects.startDirtyTimer();
  }

  /**
   * the full absolute path to the package.json file if it exists
   */
  public packageJsonFile: string = '';

  /**
   * the dependencies list from package.json
   */
  public dependencyNodeModules = new NodeModules();

  /**
   * the root path of the project.  This is the location of the package.json, tsconfig.json, or jsconfig.json that
   * is responsible for defining a project.
   */
  public projectPath:string = '';

  /**
   * path of the node_modules folder
   */
  public nodeModulesPaths: string[] = [];

  /**
   * details from the `tsconfig.json` or `jsconfig.json` file if there is one
   */
  public config:ProjectConfig | null = null;

  /**
   * all of the "source modules" available in the project., which is more than just code modules.  Anything that can be imported
   * using import statements are considered "source modules". However, these are separate from node_module modules.
   * This map is keyed on the lowercase {@link SourceModule.universalPathModuleSpecifier} of the module.  For non-code importable files,
   * like .css, .ttf, .png, etc. that is simply the absolute path and file name for the file.  For (code) modules, like .ts, .js, .jsx,
   * etc. that is the absolute path to the file, but the file name is shortened by removing the extension and `/index` if it exists. The
   * reason the name is shortened is so that no matter what style of module specifier developers use (`/index.js`, `/index`, `.js`, or no
   * extension), we'll always be able to find it in this map by searching for the shortened version of the specifier.
   */
  public sourceModules = new SourceModules(this);

  /**
   * all of the node modules being imported by the project's source modules.
   */
  public nodeModules = new NodeModules(this);

  /**
   * catalogs all of the non-symbol imports the project tends to use for imported modules.  For example, the developer
   * may like using a short alias like: `import * as cp from 'child_process'`. Import Helper will notice that and recommend
   * the shortened "cp" alias when importing 'child_process'.  Additionally if there is a module that the developer
   * always uses with a plain import (i.e. one without symbols or aliases: `import 'module';`) then Import Helper will
   * recommend that non-aliased import.
   */
  public sourceModuleImports = new SourceModuleImports(this);

  /**
   * catalogs all of the symbols imported into the project from various source code modules.  For example, if the user uses
   * `import { useState as us } from 'react'` in various areas of the project, Import Helper will offer that import
   * right away when searching for modules.  There would be no need to first find the 'react' module then go to a second
   * step to find the symbol. As with everything else, the more it's used throughout the project, the higher it
   * appears in the search results.
   *
   */
  public sourceSymbolImports = new SourceSymbolImports(this);

  /**
   * "...UsedBy..." maps:
   * the following three `FfDualKeyMap`s link each SourceModule in the project to multiple other SourceModules, Imports, and
   * node_modules.  This makes the following features possible:
   *  - sorting the search results with the most frequently used modules at the top
   *  - showing the reference counts in the search results
   *  - the "show references" report
   *  - the "show unused" report
   */

  /**
   * contains a list of the source modules that use a particular source module.  Each entry also saves the character
   * position of the import statement in the importing file module.
   */
  public sourceModuleUsedBySourceModules = new cs.FfDualKeyMap<SourceModule,SourceModule,vs.Location>();

  /**
   * contains a list of the file modules that use a particular node module.  Each entry also saves the character
   * position of the import statement in the importing file module.
   */
  public nodeModuleUsedBySourceModules = new cs.FfDualKeyMap<NodeModule,SourceModule,vs.Location>();

  /**
   * contains a list of the file modules that use a particular project import.  Each entry also saves the character
   * position of the import statement in the importing file module.
   */
  public sourceModuleImportUsedBySourceModules = new cs.FfDualKeyMap<SourceModuleImport,SourceModule,vs.Location>();

  /**
   * contains a list of the file modules that use a particular project symbol.  Each entry also saves the character
   * position of the import statement in the importing file module so that the Show References feature can bring the cursor
   * there quickly.
   */
  public sourceSymbolImportUsedBySourceModules = new cs.FfDualKeyMap<SourceSymbolImport,SourceModule,vs.Location>();

  constructor(
    public projects:Projects
  ) {
  }

  public async init() {
    if (this.packageJsonFile != '') {
      let packageJson = ss.bufferToString( await ss.readFile(this.packageJsonFile) );
      let packageObject = JSON.parse(packageJson);
      if (typeof packageObject.dependencies == 'object')
        for (let dependency in packageObject.dependencies) {
          let nodeModule = new NodeModule(this.dependencyNodeModules);
          nodeModule.universalPathModuleSpecifier = dependency;
          this.dependencyNodeModules.set(nodeModule.universalPathShortenedModuleSpecifier,nodeModule);
        }
    }

    this.nodeModulesPaths = await as.getNodeModulePaths(this.projectPath+'dummy.ts');
    this.nodeModulesPaths.push( await getGlobalNodeModulesPath() );

    this.sourceModules.load().then( () => {
      // when the file modules have loaded, kick off anything that was waiting for them
      this.isLoading = false;
      if (this.projects.onFinishedLoading)
        this.projects.onFinishedLoading();

      // also kick off the parsing of each source module to find the imports used which can take some time
      this.loadImports();

      // start the watcher to respond to project changes
      this.projectWatcher.run();
    });
  }


  /**
   * returns the list of paths that are considered to all be in one folder. based on `tsconfig.json-->rootDirs`.
   * if the path to the `importingModuleFile` is not specified in rootDirs, then this just returns the path of `importingModuleFile`.
   */
  public getModuleRootDirs(importingModuleFile: string):string[] {
    let result:string[] = [];
    let importingModulePath = ss.extractPath(importingModuleFile);
    if (this.config) {
      for (let rootDir of this.config.rootDirs) {
        if (ss.sameText(rootDir,importingModulePath))
        result.push(rootDir)
      }
    } else
      result.push(importingModulePath);
    return result;
  }


  public getRelativePath(pathOrFile:string):string {
    return ss.getRelativePath(this.projectPath,pathOrFile);
  }


  public async getPackageObject(packageName:string):Promise<any|undefined> {
    for (let nodeModulesPath of this.nodeModulesPaths) {
      let packageJsonFile = nodeModulesPath + packageName + '/package.json';
      if (await ss.fileExists(packageJsonFile)) {
        let json = ss.bufferToString( await ss.readFile(packageJsonFile) );
        return JSON.parse(json);
      }
    }
  }

  public async getPackageVersion(packageName:string):Promise<string> {
    let packageObject = await this.getPackageObject(packageName);
    if (packageObject)
      return packageObject.version ?? '';
    return '';
  }

  public cleanUnusedProjectImports() {
    let i = this.sourceModuleImports.size-1;
    let found;
    while ( found = this.sourceModuleImports.byIndex(i) ) {
      if (found.value.usedByCount == 0)
        this.sourceModuleImports.delete(found.key);
      i--;
    }
  }

  public getModuleSpecifierBasedOnPaths(absoluteModuleSpecifier:string):string {
    let result = '';
    if (this.config) {
      if (this.config.paths.matchOnMatcherPath(absoluteModuleSpecifier))
        result = this.config.paths.resultingMatchedModuleSpecifier;
      else if (this.config.baseUrlExists) {
        // since a baseURL has been defined, we'll use paths that are relative to the baseURL
        result = ss.forwardSlashes( path.relative( this.config.baseUrl, absoluteModuleSpecifier ) );
        result = ss.trimStartChars(result,['.','/']);
      }
    }
    return result;
  }


  /**
   * finds an appropriate moduleSpecifier for an absolute module specifier.  This basically reverses typescript's module resolution algorithm.
   * First check the `absoluteModuleSpecifier` to see if:
   * 1. any paths match, then calculate the "non-relative" path based on the found path and wildcard substitutions
   * 2  the baseUrl matches, then use a "non-relative" path (which is actually relative to the baseUrl)
   * 3. any rootDirs match, then use a realtive path as if the imported module resides in the same folder as importing module
   * 4. all else fails, use a relative path from the importing module to the imported module
   */
  public getBestShortenedModuleSpecifier(importingModule: Module, absoluteSortenedModuleSpecifier: string): string {

    // if found in the "virtual directory", just use that.
    if (this.config)
      if (this.config.rootDirs.inVirtualDirectory(importingModule.path))
        if (this.config.rootDirs.inVirtualDirectory(absoluteSortenedModuleSpecifier))
          return this.config.rootDirs.resultingVirtualModuleSpecifier;

    // get the specifier based on `tsconfig.paths`.
    let basedOnPaths = this.getModuleSpecifierBasedOnPaths(absoluteSortenedModuleSpecifier);

    // use paths that are relative to the importingModulePath
    let basedOnRelative = ss.forwardSlashes( path.relative( importingModule.path, absoluteSortenedModuleSpecifier) );
    if (ss.startsWith(basedOnRelative,'/'))
      basedOnRelative = '.' + basedOnRelative;
    else if (! ss.startsWith(basedOnRelative,'.') )
      basedOnRelative = './' + basedOnRelative;

    // from vscode settings:
    // Preferred path style for auto imports.
    //  - shortest: Prefers a non-relative import only if one is available that has fewer path segments than a relative import.
    //  - relative: Prefers a relative path to the imported file location.
    //  - non-relative: Prefers a non-relative import based on the `baseUrl` or `paths` configured in your `jsconfig.json` / `tsconfig.json`.
    //  - project-relative: Prefers a non-relative import only if the relative import path would leave the package or project directory. Requires using TypeScript 4.2+ in the workspace.

    // addition import-helper option:
    //  - non-relative-unless-same:
    //       Prefers a non-relative import, except when the importing module and imported module are in the same non-relative hierarchy.
    //       ex. if paths = ['*', '@bf-s/*'], then modules inside of '@bf-s/' hierarchy will use relative imports, but things outside of @bf-s
    //       will use non-relative paths to import @bf-s modules.

    let pathStyle = '';
    let importHelperPathStyle = vscode.workspace.getConfiguration('import-helper.moduleSpecifier',docs.active?.vscodeDocument?.uri).get<string>('pathStyle') ?? '';
    if (importHelperPathStyle == '' || importHelperPathStyle == 'use-vscode-settings')
      pathStyle = docs.active!.pathStyle;
    else
      pathStyle = importHelperPathStyle;

    if (pathStyle == 'shortest') {
      if (basedOnPaths != '' && (ss.getPathDepth(basedOnPaths) < ss.getPathDepth(basedOnRelative)) )
        return basedOnPaths;
      else
        return basedOnRelative;

    } else if (pathStyle == 'relative') {
        return basedOnRelative;

    } else if (pathStyle == 'non-relative') {
      if (basedOnPaths != '')
        return basedOnPaths;
      else
        return basedOnRelative;

    } else if (pathStyle == 'project-relative') {
      if (basedOnPaths != '' && ss.startsWith(absoluteSortenedModuleSpecifier, this.projectPath) )
        return basedOnPaths;
      else
        return basedOnRelative;

    } else {
      // we'll use import helper's non-relative-except style
      let importingBasedOnPaths = this.getModuleSpecifierBasedOnPaths(importingModule.file);
      if (basedOnPaths != '' && ss.getFirstFolderName(basedOnPaths) != ss.getFirstFolderName(importingBasedOnPaths))
        return basedOnPaths;
      else
        return basedOnRelative;
    }
  }
  /**
  /src/@bf-s/systemSupport
  /src/@bf-s/client/clientSupport

  importing module:      /src/@bf-s/client/clientSupport
  importing module path: /src/@bf-s/client/
  absolute module spec: /src/@bf-s/systemSupport

  based on paths:    @bf-s/systemSupport
  based on relative: ../systemSupport

  now we need an importing-based-on-paths: @bf-s/client/clientsupport

  if the "root" path of each based on path id the same, take relative.
  */

  /**
   * looks through the current vscode project and figures out the `universalPathModuleSpecifier` given a typical non-absolute module
   * specifier used in import statements.  A module specifier is "universal", when it provides an absolute path to the module if
   * it's part of the project's source, or else a relative path from node_modules.
   *
   * In order to search, this basically follows typescript's module resolution algorithm which is:
   *
   * 1. if any `paths` match ,then try calculating the absolute paths based on wildcard substitutions
   * 2. if the `baseUrl` matches, then try building an absolute path starting from the baseUrl
   * 3. if there are `rootDirs`, try building absolute paths from all the rootDirs
   * 4. try building a path relative to the importing module path and try that
   * 5. maybe `moduleSpecifier` is already an absolute path, just try it
   * 6. if all else fails, assume that it's a node_modules file specifier, which is relative from a theoretical node_modules folder
   *
   * @returns an object containing universalPathModuleSpecifier, and possibly the sourceModule it was found in.
   */
  public getUniversalPathModuleSpecifier(importingModulePath: string, anyModuleSpecifier:string):{universalPathModuleSpecifier:string, sourceModule?:SourceModule} {
    let anyShortenedModuleSpecifier = new as.ModuleSpecifierJuggler(anyModuleSpecifier).shortenedModuleSpecifier;

    if (this.config) {

      // try matching on a paths entry
      if (this.config.paths.matchOnMatcher(anyShortenedModuleSpecifier)) {
        for (let matchedMatcherPath of this.config.paths.resultingMatchedMatcherPaths) {
          let found = this.sourceModules.byUniversalPathShortenedModuleSpecifier(matchedMatcherPath)
          if (found)
            return {universalPathModuleSpecifier:found.value.universalPathModuleSpecifier, sourceModule:found.value};
        }
      }

      if (this.config.baseUrlExists) {
        // since a baseURL has been defined, we'll try building an absolute path starting from the baseUrl
        let fromBaseURL = ss.forwardSlashes( path.resolve( this.config.baseUrl, anyShortenedModuleSpecifier ) );
        let found = this.sourceModules.byUniversalPathShortenedModuleSpecifier(fromBaseURL)
        if (found)
          return {universalPathModuleSpecifier:found.value.universalPathModuleSpecifier, sourceModule:found.value};
      }

      // try building path based on the rootDirs
      for (let rootDir of this.config.rootDirs) {
        let fromRootDir = ss.forwardSlashes( path.resolve( rootDir, anyModuleSpecifier ) );
        let found = this.sourceModules.byUniversalPathShortenedModuleSpecifier(fromRootDir)
        if (found)
          return {universalPathModuleSpecifier:found.value.universalPathModuleSpecifier, sourceModule:found.value};
      }

    }

    // try building a path based on the importing module path
    let fromImportingModulePath = ss.forwardSlashes( path.resolve( importingModulePath, anyModuleSpecifier ) );
    let found = this.sourceModules.byUniversalPathShortenedModuleSpecifier(fromImportingModulePath)
    if (found)
      return {universalPathModuleSpecifier:found.value.universalPathModuleSpecifier, sourceModule:found.value};

    // as a last resort, assume that it's a node_modules specifier, or maybe it is already an absolute path
    return {universalPathModuleSpecifier:anyModuleSpecifier};
  };


  /**
   * used by {@link getFilesFromAbsoluteModuleSpecifier} to return all code files that
   * could match the absoluteModuleSpecifier.
   */
  private async getAllFiles(absoluteModuleSpecifier:string):Promise<string[]> {
    // if its pointing to a folder, it means that it is really an "index.*" file in that folder
    if (await ss.pathExists(absoluteModuleSpecifier))
      absoluteModuleSpecifier = absoluteModuleSpecifier + '/index';

    let workPath = ss.extractPath(absoluteModuleSpecifier);
    let fileName = ss.extractFileName(absoluteModuleSpecifier);
    let regexExtensions = cCodeExtensions.map( (ext) => ss.escapeRegex(ext) );
    let extensionsRegex = new RegExp(ss.escapeRegex(fileName) + '('+ ss.concatWS('|',...regexExtensions) +')$'); // <-- /fileName\.(\.d\.ts|\.ts|\.js|\.tsx|\.jsx)$/ regex filters by extensions
    let fileNames:string[] = [];
    try {
      fileNames = await ss.getItemsAtPathWithRegex(workPath, extensionsRegex, true /* files only */);
    } catch {
      // do nothing, folder doesn't exist
    }
    return fileNames.map((fileName)=>ss.prefix(workPath, fileName));
  }


  public async scanSourceModuleForImports(sourceModuleToScan:SourceModule) {
    if (!sourceModuleToScan.isCode)
      return;
    let module = new Module(this);
    module.file = sourceModuleToScan.universalPathModuleSpecifier;
    module.project = this;
    module.sourceCode = ss.bufferToString( await vscode.workspace.fs.readFile( vscode.Uri.file(sourceModuleToScan.universalPathModuleSpecifier) ));
    module.scan();
    for (let importStatement of module.importStatements) {

      if (importStatement.sourceModule) {
        this.sourceModuleUsedBySourceModules.set(importStatement.sourceModule,sourceModuleToScan,importStatement.startLocation);
      } else {
        // if the importStatement.sourceModule wasn't found when it was being looked up, we should assume the moduleSpecifier from the import was for a module in node_modules
        let nodeModule = new NodeModule(this.nodeModules);
        nodeModule.universalPathModuleSpecifier = importStatement.universalPathModuleSpecifier;
        nodeModule = this.nodeModules.byKey(nodeModule.universalPathModuleSpecifier)?.value ?? nodeModule;
        this.nodeModules.add(nodeModule);
        this.nodeModuleUsedBySourceModules.set(nodeModule,sourceModuleToScan,importStatement.startLocation);
      }

      // catalog the import itself if it is importing the entire module (not just symbols)
      if (importStatement.importKind != ImportKind.symbolsOnly) {
        let sourceModuleImport = new SourceModuleImport(this.sourceModuleImports);
        sourceModuleImport.universalPathModuleSpecifier = importStatement.universalPathModuleSpecifier;
        sourceModuleImport.alias = importStatement.alias;
        sourceModuleImport.importKind = importStatement.importKind;
        sourceModuleImport = this.sourceModuleImports.byKey(sourceModuleImport.key)?.value ?? sourceModuleImport;
        this.sourceModuleImports.add(sourceModuleImport);
        this.sourceModuleImportUsedBySourceModules.set(sourceModuleImport,sourceModuleToScan,importStatement.startLocation); // <-- adds this file module to the list of modules that use this import
      }
      // catalog any symbols this is importing
      for (let symbol of importStatement.symbols.items) {
        let sourceSymbolImport = new SourceSymbolImport(this.sourceSymbolImports);
        sourceSymbolImport.universalPathModuleSpecifier = importStatement.universalPathModuleSpecifier;
        sourceSymbolImport.name = symbol.name;
        sourceSymbolImport.alias = symbol.alias;
        sourceSymbolImport = this.sourceSymbolImports.byKey(sourceSymbolImport.key)?.value ?? sourceSymbolImport;
        this.sourceSymbolImports.add(sourceSymbolImport);
        this.sourceSymbolImportUsedBySourceModules.set(sourceSymbolImport,sourceModuleToScan,importStatement.startLocation); // <-- adds this file module to the list of modules that use this symbol
      }

    }
  }

  /**
   * slowly go through all of the project's modules and catalog the imports and aliases the developer likes to use
   */
  public async loadImports() {
    for (let [key,sourceModule] of this.sourceModules)
      await this.scanSourceModuleForImports(sourceModule);
  }


  public requestSourceModuleReload(moduleFile:string) {
    ss.debounce('requestSourceModuleReload:'+moduleFile, 1000, () => {
      let absoluteShortenedModuleSpecifier = new as.ModuleSpecifierJuggler(moduleFile).shortenedModuleSpecifier;
      let sourceModule = this.sourceModules.byUniversalPathShortenedModuleSpecifier(absoluteShortenedModuleSpecifier)?.value;
      if (sourceModule) {
        this.sourceModuleImportUsedBySourceModules.deleteKey2(sourceModule);
        this.cleanUnusedProjectImports();
        this.sourceModuleUsedBySourceModules.deleteKey2(sourceModule);
        this.nodeModuleUsedBySourceModules.deleteKey2(sourceModule);
      } else
        sourceModule = this.sourceModules.addByModuleFile(moduleFile);

      this.scanSourceModuleForImports(sourceModule);
    });
  }


  public moduleRenamed(oldModuleFile: string, newModuleFile:string) {
    let absoluteShortenedModuleSpecifier = new as.ModuleSpecifierJuggler(oldModuleFile).shortenedModuleSpecifier;
    let sourceModule = this.sourceModules.byUniversalPathShortenedModuleSpecifier(absoluteShortenedModuleSpecifier)?.value;
    if (sourceModule) {
      this.sourceModuleImportUsedBySourceModules.deleteKey2(sourceModule);
      this.cleanUnusedProjectImports();
      this.sourceModuleUsedBySourceModules.deleteKey2(sourceModule);
      this.nodeModuleUsedBySourceModules.deleteKey2(sourceModule);
      this.sourceModules.delete(sourceModule.universalPathShortenedModuleSpecifier);
    }
    sourceModule = this.sourceModules.addByModuleFile(newModuleFile);
    this.scanSourceModuleForImports(sourceModule);
  }


  /**
   * this should be called whenever we know that a module file has changed.  This re-parses the code and makes sure
   * the project's `sourceModules` and `usedBy` maps are up to date.
   */
  public moduleContentChanged(fileOrPath:string) {
    if (as.isCodeFile(fileOrPath) || as.isAdditionalExtensionFile(fileOrPath))
      this.requestSourceModuleReload(fileOrPath); // <-- requestSourceModuleReload has a debouncer to reduce excessive re-parsing
  }

}


export class Projects extends cs.FfSortedMap<string,Project> {
  public onFinishedLoading:( ()=>void ) | null = null;
  private dirtyTimer:NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  /**
   * starts the rescan of a dirty project after a small delay in case we are experiencing a major
   * change in the project like a multi-file search and replace.
   */
  public startDirtyTimer() {
    if (this.dirtyTimer != null)
      return;
    this.dirtyTimer = setTimeout(() => {
      for (let [key,project] of this)
        if (project.isDirty) {
          this.delete(key);
          this.addProject(key);
        }
      this.dirtyTimer = null;
    },10000);
  };

  public delete(key: string) {
    let found = this.byKey(key);
    if (found) {
      return super.delete(key);
    } else
      return false;
  }

  /**
   * adds a new project with a config member containing all the details about the project - including and especially, which files are included
   */
  private async addProjectFromConfig(configFile:string):Promise<Project> {
    let project = new Project(this);
    project.projectPath = ss.extractPath(configFile);

    project.config = new ProjectConfig(project);
    await project.config.load(configFile);

    await ss.traverseUp(
      project.projectPath,
      async (path) => {
        let packageFile = path + 'package.json';
        if (await ss.fileExists(packageFile)) {
          project.packageJsonFile = packageFile
          return true;
        }
        return false;
      },
      vs.getRootWorkspaceFolder(project.projectPath)
    );

    this.set(project.projectPath,project);
    return project;
  }

  /**
   * adds a basic project using the package.json folder as the project folder
   */
  private async addProjectFromPackage(packageFile:string):Promise<Project> {
    let project = new Project(this);
    project.packageJsonFile = packageFile;
    project.projectPath = ss.extractPath(packageFile);
    this.set(project.projectPath,project);
    return project;
  }

  /**
   * adds a basic project using the @param folderPath as the project folder
   */
  private async addProjectFromFolder(folderPath: string):Promise<Project> {
    let project = new Project(this);
    project.projectPath = folderPath;
    this.set(project.projectPath,project);
    return project;
  }


  /**
   * traverses up the modulePath's parent folders to find the controlling package.json, tsconfig.json, or jsconfig.json
   */
  public async addProject(modulePath:string):Promise<cs.FfMapFound<string, Project>> {
    let project:Project;
    let rootWorkspaceFolder = vs.getRootWorkspaceFolder(modulePath);
    let projectConfigFile = '';
    await ss.traverseUp(
      modulePath,
      async (path) => {
        projectConfigFile = await ss.getFirstFile([
            path+'tsconfig.json',
            path+'jsconfig.json',
            path+'package.json'
        ]);
        return (projectConfigFile != '');
      },
      rootWorkspaceFolder
    );

    if (ss.endsWith(projectConfigFile, 'config.json'))
      project = await this.addProjectFromConfig(projectConfigFile);
    else if (ss.endsWith(projectConfigFile, 'package.json'))
      project = await this.addProjectFromPackage(projectConfigFile);
    else
      project = await this.addProjectFromFolder(rootWorkspaceFolder);

    await project.init();

    return new cs.FfMapFound<string, Project>(project.projectPath,project);
  }


  /**
   * returns the project corresponding to a modulePath.
   */
  public byModulePath(modulePath:string):cs.FfMapFound<string,Project> | undefined {
    return this.byFunc( project => ss.startsWith(modulePath,project.projectPath) );
  }

}

export let projects = new Projects();



