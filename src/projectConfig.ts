import * as ss from './common/systemSupport';
import * as vs from './common/vscodeSupport';
import * as ts from 'typescript';
import * as path from 'path';
import { Project, projects } from './project';
import * as cs from './common/collectionSupport';

export class ProjectConfig {

  /**
   * the full absolute path to the tsconfig/jsconfig file
   */
  public tsConfigJsonFile: string = '';

  /**
   * the baseUrl setting from tsconfig/jsconfig.  This tells typescript that any module specifiers that don't begin
   * with a dot or a slash should be looked up relative to this "baseURL" path before looking the module up in the
   * node_modules folder.  If the baseUrl setting itself is a relative path, the absolute baseUrl will be calculated
   * relative to the containing tsconfig/jsconfig.
   */
  public baseUrl: string = '.';

  /**
   * in the future baseURL will be decoupled from paths so that paths can exist without baseURL.
   * see https://github.com/microsoft/TypeScript/issues/31869#issuecomment-515167432
   * until then, a workaround for deactivating baseURL can be used by developers:  Developers can add
   * a null to the end of the path to make it still look like a path, but making it actually point
   * to a non-extenstant place as far as the OS is concerned.  That way, it enables `paths` to be used,
   * but it will stop imports from being able to reference non-`node_modules` modules by omitting the dot
   * or slash in the beginning of the module specifier.
   */
  public baseUrlExists: boolean = false;

  /**
   * comes from the paths setting in tsconfig/jsconfig.  "paths" is an unfortunate name for this setting because
   * it doesn't nearly describe this very complex feature.  Firstly, this is only for module resolution, ie. this
   * is only used by the typescript compiler to locate modules in import statements. Note that module resolution
   * has nothing to do with which files are considered to be part of the project. Furthermore `paths` are only for
   * resolving module specifier paths that *do not* start with a dot or a slash.
   *
   * How it works is as follows: the actual data structure consists of an object (i.e. a "map") with a set of
   * "matcher" keys, associated with arrays of "matcher paths":
   * ```
   *  {
   *    "<matcher1>":["matcher1path1","matcher1path2"],
   *    "<matcher2>":["matcher2path2","matcher2path2"],
   *  }
   * ```
   * for example, if we have the following project:
   * ```
   * 🗁 c:/myProject/
   *   🗁 src
   *     🗁 screen
   *       🗋 windows.ts
   *       🗋 desktop.ts
   *     🗁 audio
   *       🗋 player.ts
   *       🗋 recorder.ts
   *     🗋 main.ts
   *     🗋 sub.ts
   *   🗋 tsconfig.json
   * ```
   * inside the tsconfig file: c:/myProject/tsconfig.json
   * ```
   *   "baseUrl": "./src",
   *   "paths": {
   *     "*": ["./screen/*"],
   *     "au/*": ["./audio/*"],
   *     "rec": ["./audio/recorder"]
   *   }
   * ```
   * ### example 1
   * inside the importing module: c:/myProject/src/main.ts
   * ```
   *   import * as xx from 'desktop';
   * ```
   *
   * the module specifier 'myTools/utils' will be tested against the following paths:
   * ```text
   *  1. c:/myProject/src/screen/desktop    ← because of the "*" in paths    (since its found here, steps 2-3 are skipped)
   *  2. c:/myProject/src/desktop           ← because of the baseUrl
   *  3. node_modules/desktop               ← always checks here as a last resort
   *```
   * ### example 2
   * inside the importing module: c:/myProject/src/main.ts
   * ```
   *   import * as xx from 'rec';
   * ```
   * the module specifier 'myTools/utils' will be tested against the following paths:
   * ```text
   *  1. c:/myProject/src/screen/rec       ← because of the "*" in paths
   *  2. c:/myProject/src/audio/recorder   ← because of the "rec" in paths   (since its found here, steps 3-4 are skipped)
   *  3. c:/myProject/src/rec              ← because of the baseUrl
   *  4. node_modules/rec                  ← always checks here as a last resort
   *```
   * ### example 3
   * inside the importing module: c:/myProject/src/main.ts
   * ```
   *   import * as xx from 'sub';
   * ```
   * the module specifier 'myTools/utils' will be tested against the following paths:
   * ```text
   *  1. c:/myProject/src/screen/rec       ← because of the "*" in paths
   *  2. c:/myProject/src/audio/recorder   ← because of the "rec" in paths   (since its found here, steps 3-4 are skipped)
   *  3. c:/myProject/src/rec              ← because of the baseUrl
   *  4. node_modules/rec                  ← always checks here as a last resort
   *```
   *
   */
  public paths = new Paths(); //@todo is this being used?

  /**
   * rootDirs setting in tsconfig/jsconfig.  This is another oddly named item in the config file. This is only for resolving
   * modules for module specifiers that start with a dot. Conceptually, the specified paths in rootDirs together establish a large
   * "virtual directory" that combines all of the files in all of paths listed. That means any module located in the "virtual
   * directory" can import any other module in the "virtual directory" by referencing it as if it were located in the same folder
   * as the importing module. The purpose of this is to allow you to develop your project as a tree of multiple folders, but then
   * have your build process place all of the transpiled files into one folder for execution.
   */
  public rootDirs = new RootDirs();

  /**
   * `include` setting in tsconfig/jsconfig.  If specified, only files here (and in the `files` setting, which I'm ignoring on purpose) are considered to be in the project
   */
  public includes: string[] = [];

  /**
   * `exclude` setting in tsconfig/jsconfig. Removes folders and files from the project.
   */
  public excludes: string[] = [];

  /**
   *  list of files belonging to the project. This is automatically built for us by the typescript api and is in local OS format
   *  (i.e. with backslash path separators on Windows)
   */
  public rawFiles: string[] = [];

  /**
   * list of folders the typescript api suggests to watch for changes
   */
  public wildcardDirectories: ts.MapLike<ts.WatchDirectoryFlags> = {};

  constructor(
    public project: Project
  ) {
  }

  public async load(configFile: string) {
    let parseConfigHost = new vs.ParseConfigHost();
    let tsConfigSourceFile = ts.readJsonConfigFile(configFile, ts.sys.readFile);
    this.tsConfigJsonFile = configFile;

    let parsedConfig = ts.parseJsonSourceFileConfigFileContent(
      tsConfigSourceFile,
      parseConfigHost,
      ss.extractPath(configFile),
      undefined,
      ss.extractFileName(configFile),
      undefined
      //,
      //[{
      //extension: 'css',
      //isMixedContent: false,
      //scriptKind: ts.ScriptKind.Deferred
      //}]
    );

    (global as any).$config = parsedConfig;
    (global as any).$tsConfig = this;
    (global as any).$projects = projects;

    this.baseUrl = parsedConfig.options.baseUrl ?? '';
    this.baseUrlExists = this.baseUrl != '' && ss.fileExistsSync(this.baseUrl);

    let matcherBaseURL = ss.ifBlank(this.baseUrl, this.project.projectPath);
    this.paths.clear();
    if (parsedConfig.options.paths)
      for (let matcher in parsedConfig.options.paths) {
        let matcherPaths = parsedConfig.options.paths[matcher];
        for (let i = 0; i < matcherPaths.length; i++)
          matcherPaths[i] = ss.forwardSlashes(path.resolve(matcherBaseURL, matcherPaths[i]));
        this.paths.set(matcher, matcherPaths);
      }

    this.rootDirs.clear();
    this.rootDirs.push(...this.internalizePaths(parsedConfig.options.rootDirs ?? []));
    this.includes = (parsedConfig as any).configFileSpecs?.includeSpecs as string[] ?? [];
    this.excludes = (parsedConfig as any).configFileSpecs?.excludeSpecs as string[] ?? [];
    this.rawFiles = parsedConfig.fileNames;
    this.wildcardDirectories = parsedConfig.wildcardDirectories ?? {};

  }

  public clearRawFiles() {
    this.rawFiles = [];
  }

  private internalizePaths(paths: string[]): string[] {
    return paths.map(path => ss.internalizePath(path));
  }
}
class RootDirs extends cs.FfArray<string> {
  public resultingVirtualModuleSpecifier: string = '';

  /**
   * if @param absoluteModuleSpecifier is contained by one of the dirs, this returns true, and sets
   * the @member virtualModuleSpecifier to the calculculated virtual module specifier
   */
  public inVirtualDirectory(absoluteModuleSpecifier: string): boolean {
    this.resultingVirtualModuleSpecifier = '';
    for (let path of this) {
      if (ss.startsWith(absoluteModuleSpecifier, path)) {
        this.resultingVirtualModuleSpecifier = './' + absoluteModuleSpecifier.substr(path.length);
        return true;
      }
    }
    return false;
  }

}




class Paths extends cs.FfMap<string, string[]> {

  /**
   * this is set if @member matchOnMatcherPath() returns true
   */
  public resultingMatchedModuleSpecifier: string = '';

  /**
   * this is set if @member matchOnMatcher() returns true
   */
  public resultingMatchedMatcherPaths: string[] = [];

  /**
   * returns true and sets `matchedPath` if a path match could be made from the `absoluteModuleSpecifier`
   */
  public matchOnMatcherPath(absoluteModuleSpecifier: string): boolean {
    this.resultingMatchedModuleSpecifier = '';
    for (let [matcher, matcherPaths] of this.entries()) {
      for (let matcherPath of matcherPaths) {
        let matcherPathRegEx = ss.escapeRegex(matcherPath).replace('\\*', '(.*)'); // "c:/proj/src/*" --> "c:\/proj\/src\/(.*)"
        let matches = absoluteModuleSpecifier.match(matcherPathRegEx);
        if (matches) {
          this.resultingMatchedModuleSpecifier = matches[1] ?? '';
          if (!ss.isBlank(this.resultingMatchedModuleSpecifier)) {
            this.resultingMatchedModuleSpecifier = matcher.replace('*', this.resultingMatchedModuleSpecifier);
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * returns true and sets @member matchedMatcherPaths if a set of possible paths could be made from the @param moduleSpecifier
   */
  public matchOnMatcher(moduleSpecifier: string): boolean {
    this.resultingMatchedMatcherPaths = [];
    for (let [matcher, matcherPaths] of this.entries()) {
      let matcherRegEx = ss.escapeRegex(matcher).replace('\\*', '(.*)'); // "src/*" --> "src\/(.*)"
      let matches = moduleSpecifier.match(matcherRegEx);
      if (matches) {
        this.resultingMatchedModuleSpecifier = matches[1] ?? '';
        for (let matcherPath of matcherPaths)
          this.resultingMatchedMatcherPaths.push(matcherPath.replace('*', this.resultingMatchedModuleSpecifier));
      }
    }
    return this.resultingMatchedMatcherPaths.length > 0;
  }

}
