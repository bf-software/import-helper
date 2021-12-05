/**
 * this module resolves a module selector to a list of possible files the selector may be referring to.
 * Module resolution is quite complex and warrants it's own module.
 */

import { Project } from './project'
import * as ss from './common/systemSupport'
import * as path from 'path'
import * as as from './appSupport'
import * as cs from './common/collectionSupport'
import * as semver from 'semver'

/**
 * describes a source file for a project.  This is mainly used when returning multiple
 * files to Import Helper's open command.
 */
export interface ProjectFileDetails {
  /** a little note about where the actual file was found, and maybe why it was chosen */
  locationInfo:string;
  /** the file with a shortened path suitable for display */
  relativeDisplayFile?:string;
}

export class ProjectFileMap extends cs.FfMap<string,ProjectFileDetails> {
  public add(file: string, locationInfo:string) {
    let found = this.byKey(file);
    if (found)
      locationInfo = ss.commaSpaces(found.value.locationInfo, locationInfo);
    this.set(file,{locationInfo})
  }
}

export class ProjectModuleResolver {
  private exportFiles = new cs.FfMap<string, string>();
  private typescriptVersion: string = '';

  public projectFileMap = new ProjectFileMap();

  constructor(
    public project:Project
  ) {}

  /**
   * returns an array of {@link ProjectFile} objects pointing to the files referred to by the
   * `anyModuleSpecifier` param.  This uses typescript's node module resolution algorithm to
   * gather the files.  The algorithms are as follows:
   *
   * [relative& absolute module specifiers]
   *
   * note: absolute module specifiers do the same thing as relative, but they don't heed `rootDirs`
   *
   * example:
   *   importing module location: `/project/src/app.ts`
   *   *relative* import inside of `app.ts`: `import * as mod from './module/submodule'
   *   rootDirs in tsconfig.json: `rootDirs: ["./src", "./src2"]`
   *
   * the search locations:
   *                                      <-- starting the "main" algorithm always with a shortened module specifier (i.e. with the code extensions removed)
   *   /project/src/module/submodule.nonCodeExt  <-- if has non hidden code ext, try it in case it's something like, .css, .ttf, .svelte etc.
   *                                      <-- begin typescript searches
   *   /project/src/module/package.json   <-- must precheck if there is an overriding package.json that might affect the availability of the submodules
   *     package.json-->"typings" or "types" <-- precheck for a submodule specification here
   *     package.json-->"exports"              <-- precheck for a submodule specification here
   *   /project/src/module/submodule.ts   <-- start checks for all hidden typescript code extensions
   *   /project/src/module/submodule.tsx
   *   /project/src/module/submodule.d.ts
   *   /project/src/module/submodule.mjs   <-- start checks for all hidden javascript code extensions
   *   /project/src/module/submodule.js
   *   /project/src/module/submodule.jsx
   *   /project/src/module/submodule.cjs
   *   /project/src/module/submodule/package.json   <-- this starts the checks in a folder called 'submodule'
   *     package.json-->"typings" or "types"   <-- simply points to a .d.ts file
   *     package.json-->"typesVersions"        <-- super complex mapping for types/typings
   *     package.json-->"main"                 <-- simply points to a .js or .mjs file
   *     package.json-->"exports"              <-- super complex list of stuff
   *   /project/src/module/submodule/index.ts
   *   /project/src/module/submodule/index.tsx
   *   /project/src/module/submodule/index.d.ts
   *   /project/src/module/submodule/index.mjs
   *   /project/src/module/submodule/index.js
   *   /project/src/module/submodule/index.jsx
   *   /project/src/module/submodule/index.cjs
   *
   *   ... and then the "main" algorithm again for /project/src2 because of rootDirs and the fact that app.ts is in /src, which is part of rootDirs
   *
   *
   * [base-relative module specifiers]   (aka "non-relative" module specifiers)
   *
   * example
   *   importing module location: `/project/src/app.ts`  <-- this mainly influences the starting location for looking for node_modules
   *   *base-relative* import inside of `app.ts`: `import * as mod from 'module/submodule'
   *   baseURL in tsconfig.json: <none> <-- no baseURL defined, therefore baseURL is `/project` by default when it comes to interpreting the tsconfig `paths`
   *   paths in tsconfig.json: paths: ['*','./src/common/*']
   *
   * the search locations:
   *
   *   ... first the "main" algorithm below, but for /project/src/common/ because of tsconfig.json-->paths
   *
   *   ... then run it for /project/src/node_modules/
   *
   *   ...                                             <-- see above *relative* "main" algorithm, which is mostly the same as this...
   *   /project/src/node_modules/@types/module/submodule.d.ts         <-- the only 2 things different from the *relative* "main" algorithm
   *   /project/src/node_modules/@types/module/submodule/index.d.ts   <--'
   *   /project/src/node_modules/module/submodule/index.ts
   *   ...
   *
   *  ... and then if "full source code" or a non hidden code ext was found, we're done, else, run the "main" algorithm again for /project/node_modules, and /node_modules if they exist
   *      "full source code" is if a .ts, or .tsx was found, or both a .d.ts and a .mjs, .js, .jsx was found.
   *
   */
  public async getProjectFiles(importingModuleFile:string, anyModuleSpecifier:string):Promise<ProjectFileMap> {
    let isAbsolute = ss.isAbsolutePath(anyModuleSpecifier);
    let isRelative = !isAbsolute && ss.isRelativePath(anyModuleSpecifier);
    let isBaseRelative = !isAbsolute && !isRelative;

    this.projectFileMap.clear();

    this.typescriptVersion = await this.project.getPackageVersion('typescript');

    if (isAbsolute) {
      let relativeModuleSpecifier = ss.getRelativePath(this.project.projectPath, anyModuleSpecifier);
        await this.mainAlgorithm(this.project.projectPath, relativeModuleSpecifier);

    } else if (isRelative) {
      let relativeModuleSpecifier = anyModuleSpecifier;
      let rootDirs = this.project.getModuleRootDirs(importingModuleFile);
      for (let rootDir of rootDirs)
        await this.mainAlgorithm(rootDir, relativeModuleSpecifier);

    } else if (isBaseRelative) {
      let baseRelativeModuleSpecifier = anyModuleSpecifier;

      // try the tsconfig.json->paths
      if (this.project.config?.paths.matchOnMatcher(anyModuleSpecifier)) {
        for (let projectPath of this.project.config.paths.resultingMatchedMatcherPaths) {
          let parentPath = ss.extractPath(projectPath);
          let moduleFileName = ss.extractFileName(projectPath);
         await this.mainAlgorithm(parentPath, './'+moduleFileName);
        }
      }

      // try all node_modules
      for (let nodeModulePath of this.project.nodeModulesPaths)
        await this.mainAlgorithm(nodeModulePath, './'+baseRelativeModuleSpecifier);
    }

    for (let [file, projectFileDetails] of this.projectFileMap) {
      projectFileDetails.relativeDisplayFile = ss.removePrefix(ss.getRelativePath(this.project.projectPath,file), './');
    }

    return this.projectFileMap;

  }

  /**
   * the search is complete when we've found a non-hidden extension file (.css, .svelte, etc.), a ts, a tsx, or a .d.ts
   * @param absoluteModulePath this is the starting point for kicking off the "main" algorithm that looks for module files
   * @param relativeModuleSpecifier this is a module specifier that can be resolved with the `absoluteModulePath` to locate a module
   */
  private async mainAlgorithm(absoluteModulePath:string, relativeModuleSpecifier:string) {
    let juggler = new as.ModuleSpecifierJuggler(relativeModuleSpecifier);

    // if it doesn't have a shortenable code ext, see if it exists, it's probably a .css, .ttf, or other importable, but non-code file, or it might be a .svelte file
    if (! juggler.isShortened) {
      let possibleNonShortenedFile = ss.resolveFile(absoluteModulePath,relativeModuleSpecifier);
      if (await ss.fileExists(possibleNonShortenedFile))
        this.projectFileMap.add(possibleNonShortenedFile,'');
    }

    // precheck all of the parent folders for an overriding package.json file which may control the submodule paths via the exports entry
    let parentPath = ss.extractPath(juggler.shortenedModuleSpecifier);
    let precheckModuleSpecifier = juggler.shortenedModuleSpecifier.substr(parentPath.length);
    while (parentPath != '') {
      let packageJsonFile = ss.resolvePath(absoluteModulePath,parentPath) + 'package.json';
      if (await ss.fileExists(packageJsonFile))
        await this.addPrecheckFilesFromPackageJson(packageJsonFile,precheckModuleSpecifier);
      parentPath = ss.extractPath(parentPath);
    }

    // test for all the hidden code entensions
    for (let ext of as.cHiddenCodeExtensionsRank) {
      let possibleHiddenExt = ss.resolveFile(absoluteModulePath, juggler.shortenedModuleSpecifier + ext);
      if (await ss.fileExists(possibleHiddenExt))
        this.projectFileMap.add(possibleHiddenExt, '');
    }

    // process the main package.json if it exists
    let packageJsonFile = ss.resolveFile(absoluteModulePath, juggler.shortenedModuleSpecifier +  '/package.json');
    if (await ss.fileExists(packageJsonFile))
      await this.addFilesFromPackageJson(packageJsonFile);

    // test for @types if this is a node_modules
    if (ss.extractFolderName(absoluteModulePath) == 'node_modules') {
      let possibleTypesDefinitionPath = ss.resolveFile(absoluteModulePath+'@types/',juggler.shortenedModuleSpecifier);
      let possibleTypesDefinitionFile = possibleTypesDefinitionPath + '.d.ts';
      if (await ss.fileExists(possibleTypesDefinitionFile))
        this.projectFileMap.add(possibleTypesDefinitionFile, 'definitely typed');
      else {
        possibleTypesDefinitionFile = possibleTypesDefinitionPath +'/index.d.ts';
        if (await ss.fileExists(possibleTypesDefinitionFile))
          this.projectFileMap.add(possibleTypesDefinitionFile, 'definitely typed');
      }
    }

    // test for index with all hidden code entensions
    for (let ext of as.cHiddenCodeExtensionsRank) {
      let possibleHiddenIndexExt = ss.resolveFile(absoluteModulePath, juggler.shortenedModuleSpecifier +'/index'+ ext);
      if (await ss.fileExists(possibleHiddenIndexExt))
        this.projectFileMap.add(possibleHiddenIndexExt, '');
    }

  }


  private async addPrecheckFilesFromPackageJson(packageJsonFile:string, precheckModuleSpecifier:string) {
    let json = ss.bufferToString( await ss.readFile(packageJsonFile) );
    let packagePath = ss.extractPath(packageJsonFile);
    let packageObject = JSON.parse(json);
    // todo: use exports to see if there are any that match the precheckModuleSpecifier
  }


  /**
   * looks at package.json's "typings" or "types", "typesVersions", "main", and "exports" for the actual source and type files that represent
   * the main entry points into the package.
   */
  private async addFilesFromPackageJson(packageJsonFile:string) {
    let json = ss.bufferToString( await ss.readFile(packageJsonFile) );
    let packagePath = ss.extractPath(packageJsonFile);
    let packageObject = JSON.parse(json);

    let packageLocationInfo = ss.extractFolderName(ss.extractPath(packageJsonFile))+'/package.json ➜ ';

    // check for types or typings
    let typesFile = '';
    let typesName = '';
    let relativeTypesFile = '';
    if (typeof packageObject.types == 'string'){
      relativeTypesFile = packageObject.types;
      typesName = 'types';
    }
    if (typeof packageObject.typings == 'string') {
      relativeTypesFile = packageObject.typings;
      typesName = 'typings';
    }
    if (relativeTypesFile != '') {
      let possibleTypesFile = ss.resolveFile(packagePath, relativeTypesFile);
      if (await ss.fileExists(possibleTypesFile))
        typesFile = possibleTypesFile;
    }

    // check for typesVersions
    if (typesFile != '') {
      if (packageObject.typesVersions) {
        for (let typesVersion of packageObject.typesVersions) {
          if (semver.satisfies(this.typescriptVersion, typesVersion)) {
            let versionMap = packageObject.typesVersions[typesVersion];
            if (versionMap) {
              let matcher:string = versionMap.keys[0];
              let matcherValue:string = versionMap[matcher][0] ?? '';
              let versionedTypesFile = '';
              if (matcherValue != '') {
                if (matcher == '*')
                  versionedTypesFile = ss.internalizeFile(path.normalize(matcherValue.replace('*',relativeTypesFile)))
                else
                  versionedTypesFile = ss.extractPath(relativeTypesFile) + matcherValue
                if (versionedTypesFile != '')
                  typesFile = ss.resolveFile(packagePath, versionedTypesFile);
              }
            }
            break;
          }
        }
      }
      this.projectFileMap.add(typesFile, packageLocationInfo+typesName);
    }

    // check for main
    let relativeMainFile = '';
    if (typeof packageObject.main == 'string')
      relativeMainFile = packageObject.main;
    if (relativeMainFile != '') {
      let possibleMainFile = ss.resolveFile(packagePath, relativeMainFile);
      if (await ss.fileExists(possibleMainFile))
        this.projectFileMap.add(possibleMainFile, packageLocationInfo+'main');
    }

    // check for exports
    if (typeof packageObject.exports == 'string') {
      this.projectFileMap.add(ss.resolveFile(packagePath,packageObject.exports), packageLocationInfo+'exports');
    } else if (packageObject.exports) {
      if (packageObject.exports['.']) {
        let exportsFiles = this.flattenExports(packageObject.exports['.']);
        for (let [relativeFile,locationInfo] of exportsFiles)
          this.projectFileMap.add(ss.resolveFile(packagePath,relativeFile), packageLocationInfo+'exports: '+locationInfo);
      }
    }

  }

  private recursiveFlattenExports(exports:any, locationInfo:string = '') {
    for (let exportItem in exports) {
      let newLocationInfo = ss.concatWS('.',locationInfo,exportItem);
      if (typeof exports[exportItem] == 'string') {
        let file:string = exports[exportItem];
        let found = this.exportFiles.byKey(file);
        if (found)
          newLocationInfo = ss.commaSpaces(found.value, newLocationInfo)
        this.exportFiles.set(file, newLocationInfo)
      } else
        this.recursiveFlattenExports(exports[exportItem], newLocationInfo );
    }
  }

  private flattenExports(exports:Object) {
    this.exportFiles.clear();
    this.recursiveFlattenExports(exports);
    return this.exportFiles;
  }


}