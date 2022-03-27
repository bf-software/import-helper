/*
 * a note about file path terminology used in this module:
 *
 * Windows example: c:\myProject\main.ts
 * non-Windows example: /myProject/main.ts
 *
 * ["file"]
 *
 * both of the above examples are "files".  "file" is always a string that refers to
 * the file path, file name, and extension.
 *
 *
 * ["path" (or "file path" may be used to be more specific)]
 *
 * the part of the example that ends just before the file name begins.  It *always* ends
 * with a slash. For Windows the "path" is "c:\myProject\".
 *
 *
 * ["root path"]
 *
 * The root path would be "c:\" for the Windows example. For the non-Windows example,
 * "/" is the root path.
 *
 *
 * ["file name"]
 *
 * the file name in the examples is "main.ts".  It *always* includes the extension.
 *
 *
 * ["extension" (or "ext" for short, or sometimes "file extension" may be used to be more specific)]
 *
 * the last dot, and all of the following text: ".ts".  It *always* includes the dot.
 *

 * ["file name without extension" (or "file name no ext" for short)]
 *
 * the part of the filename without the extension: "main". The dot is *never* included.
 *
 *
 * ["folder"]
 *
 * a full path name to a directory.  in the Windows example, the folder is: "c:\myProject\".  A folder
 * is like a path with the minor distinction that it refers to the actual directory at the end of the path.
 *
 *
 * ["folder name"]
 *
 * is just the name of the last directory in a path.  It *never* contains slashes. example: "myProject"
 *
 * Note: most functions will honor and keep the type of slash character provided in the parameters
 * when possible.  However, when in doubt, paths will use forward slashes by default.
 *
 */

import { URL } from 'url';
import * as fs from 'fs';
import * as nodePath from 'path';
import { promises as fsp } from 'fs';

import * as ss from './systemSupport';
import * as cs from './collectionSupport';


// command line ////////////////////////////////////////////////////////////////

export class CommandLineParams extends cs.FfArray<string> {
  constructor(argv:string[]) {
    super();
    let isProgramParam = false;
    for (let param of argv) {
      if (isProgramParam)
        this.push(param);
      if (ss.endsWith(param,'.js'))
        isProgramParam = true;
    }
  }

  public byText(text:string): cs.FfArrayFound<string> | undefined {
    return this.byFunc( param => ss.sameText(param,text));
  }
}


// platform ////////////////////////////////////////////////////////////////////

export let platform = {
  isWindows: (process?.platform == 'win32' ?? false),
  isMac: (process?.platform == 'darwin' ?? false),
  isUnix: (typeof process != 'undefined' && process.platform != 'win32' && process.platform != 'darwin'),
  isElectron: (Boolean(process?.versions['electron']) ?? false)
}


/**
 * takes an internal application file or path which always uses forward slashes and returns the platform standard slashes
 * (i.e. if this is Windows, it changes all forward slashed to back slashes)
 */
export function platformizeFile(fileOrPath:string):string {
  if (platform.isWindows)
    return fileOrPath.replace(/\//g,'\\');
  else
    return fileOrPath;

}


// process /////////////////////////////////////////////////////////////////////

/**
 * returns the `.js` entry point script passed to node or electron.
 */
export function getEntryPointFile() {
  /**
   * Note that when using webpack, both `process.mainModule.filename` and `import.meta.url` exist.
   * However the `import.meta.url` points to the mapped (original source) of the entrypoint.  This
   * is not desirable, that's why `process.mainModule.filename` is checked first.
  */
  let file:string = process.mainModule?.filename ?? '';
  if (file == '')
  try {
    //@ts-ignore: the only way i can think of to check if `import.meta.url` is there.
    file = '';// internalizeFile(url.fileURLToPath(import.meta.url));
  } catch (e) {
    file = '';
  }
  return file;
}


// files and paths /////////////////////////////////////////////////////////////////////////////

/**
 * returns the root folder path of a path or file. ex `c:/data/test.ts` --> `c:/` or `/home/joe/` --> `/`
 */
export function getRootPath(pathOrFile:string) {
  return ss.forwardSlashes(nodePath.parse(pathOrFile).root);
}

export function isRoot(path:string) {
  let rootPath = getRootPath(path);
  if (rootPath == '')
    return true;
  return (rootPath == path);
}

/**
 * if `toPathOrFile` doesn't have a relative path to `fromPath`, the `toPathOrFile` is returned.
 * Note that if `toPathOrFile` is not an absolute path, this will attempt to return a best guess
 * for the absolute path to `toPathOrFile`.
 */
export function getRelativePath(fromPath:string, toPathOrFile:string):string {
  let result = nodePath.relative(fromPath,toPathOrFile);
  if (ss.endsWith(toPathOrFile,'/'))
    result = ss.internalizePath(result);
  else
    result = ss.internalizeFile(result);

  // fix any paths that aren't absolute and don't start with a '.'
  if (!ss.isAbsolutePath(result))
    if (!result.startsWith('.'))
      result = './'+result;

  return result;
}

/**
 * calls `func` for each path going up the tree.  The first call to `func` is for `startPath`, the last call is for the root folder.
 * @param startPath the starting path for traversal
 * @param func the first call will be with `path` = `startPath` | return `true` to stop traversal
 * @param untilPath if specified, the traversal stops after the `untilPath` is reached
 */
export async function traverseUp(startPath:string, func:(path:string)=>Promise<boolean>|Promise<void>, untilPath:string = ''):Promise<void> {
  let path = startPath;
  while (path !== '') {
    if (await func(path))
      return;
    if (path == untilPath || isRoot(path))
      break;
    path = ss.extractPath( ss.trimPathEndSlash(path) );
  }
}

/**
 * returns the number of levels deep a path is.
 * ex.
 * - `/home/test/.config` = 2
 * - `/home/test/` = 1
 * - `c:/windows/config.ini` = 1
 * - `.config` = 0
 * - `/` = 0
 * - `/wow.txt` = 0
 * - `../relative/is/ok` = 3
 */

export function extractFolderNames(pathOrFile:string):string[] {
  let root = getRootPath(pathOrFile);
  let path = ss.trimStartStr(pathOrFile,root);
  if (! path.endsWith('/'))
    path = ss.extractPath(pathOrFile);
  path = ss.trimEndChars(path,['/']);
  return path.split('/');
}

export function getPathDepth(pathOrFile:string):number {
  let folders = extractFolderNames(pathOrFile);
  return folders.length;
}

export function getFirstFolderName(pathOrFile:string):string {
  let folders = extractFolderNames(pathOrFile);
  return folders[0] ?? '';
}

/**
 * if `toRelativeOrAbsoluteFile` is relative, it adds the `fromPath` and returns the file.  If it is already absolute,
 * it simply returns the value of `relativeOrAbsoluteFile`.
 */
export function resolveFile(fromPath:string, toRelativeOrAbsoluteFile:string):string {
  return ss.internalizeFile(nodePath.resolve(fromPath,toRelativeOrAbsoluteFile));
}

/**
 * if `toRelativeOrAbsolutePath` is relative, it adds the `fromPath` and returns the path.  If it is already absolute,
 * it simply returns the value of `toRelativeOrAbsolutePath`.
 */
export function resolvePath(fromPath:string, toRelativeOrAbsolutePath:string):string {
  return ss.internalizePath(nodePath.resolve(fromPath,toRelativeOrAbsolutePath));
}

/**
 * checks if the file exists.  If the path points to a folder, it returns false.
 */
export async function fileExists(file:string):Promise<boolean> {
  try {
    let stats = await fsp.stat(file);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * checks if the file exists.  If the path points to a folder, it returns false.
 */
export function fileExistsSync(file:string):boolean {
  try {
     let stats = fs.statSync(file);
     return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * checks if the folder exists for the supplied path.  If the path points to a file, it returns false.
 */
export async function pathExists(path:string):Promise<boolean> {
  try {
     let stats = await fsp.stat(path);
     return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * checks if the folder exists for the supplied path.  If the path points to a file, it returns false.
 */
export function pathExistsSync(path:string):boolean {
  try {
     let stats = fs.statSync(path);
     return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * return the first file that exists in the files
 * @returns the file, or an empty string if none of the files exist.
 */
export async function getFirstFile(files:string[]):Promise<string> {
  for (let file of files)
    if (await fileExists(file))
      return file;
  return '';
}


export async function readFile(file:string):Promise<Uint8Array> {
  return fsp.readFile(file);
}
export function readFileSync(file:string):Uint8Array {
  return fs.readFileSync(file);
}

export async function readStringFromFile(file:string):Promise<string> {
  return (await fsp.readFile(file, {encoding: 'utf8'}));
}
export function readStringFromFileSync(file:string):string {
  return fs.readFileSync(file, {encoding: 'utf8'}) ?? '';
}

export async function writeFile(file:string, buffer:Uint8Array):Promise<void> {
  return fsp.writeFile(file, buffer, {encoding:'binary'});
}
export function writeFileSync(file:string, buffer:Uint8Array) {
  fs.writeFileSync(file, buffer, {encoding:'binary'});
}

export async function writeStringToFile(file:string, s:string):Promise<void> {
  return fsp.writeFile(file, s, {encoding:'utf8'});
}
export function writeStringToFileSync(file:string, s:string) {
  fs.writeFileSync(file, s, {encoding: 'utf8'});
}

export async function readFileBytes(file:string, byteCount:number):Promise<Uint8Array> {
  let chunks:Buffer[] = [];
  let stream = fs.createReadStream(file, { encoding: 'binary', start: 0, end: byteCount-1 });
  for await (let chunk of stream)
    chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}






/**
 * sends all of the file and folder names found at a path through a filter callback and returns the results in a string array
 */
export async function getItemsAtPath(path:string, filterFunc: (fileName:string, isFolder?:boolean) => boolean):Promise<string[]> {
  let items:string[] = [];
  let dirEntries = await fsp.readdir(path,{withFileTypes: true});
  for (let dirEnt of dirEntries)
    if ( filterFunc(dirEnt.name, dirEnt.isDirectory()) )
      items.push(dirEnt.name);
  return items;
}

export async function getItemsAtPathWithRegex(path:string, regex:RegExp, filesOnly:boolean = false):Promise<string[]> {
  return getItemsAtPath(path, (fileName, isFolder) => {
    if (filesOnly && isFolder)
      return false;
    return (fileName.search(regex) != -1);
  });
}

export async function deleteFile(file:string) {
  return fsp.unlink(file);
}

/**
 * @returns true if the file existed, false if it didn't exist.
 */
export async function deleteFileIfExists(file:string):Promise<boolean> {
  if (await fileExists(file)) {
    await fsp.unlink(file);
    if (await fileExists(file))
      throw new Error('could not delete: '+file);
    return true;
  }
  return false;
}
