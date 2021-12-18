/**
 * @module systemSupport
 *
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


// file system /////////////////////////////////////////////////////////////////
export function extractFileName(file:string):string {
  return (file.split('\\').pop() ?? '' ).split('/').pop() ?? '';
}

/**
 * - if given this file: `/home/project/test.txt`, this returns "project"
 * - if given this path: `/home/project/`, this also returns "project"
 * - if given a root file or path: `/`, `c:/`, `/home/` or `/test.txt`, this returns an empty string
 */
export function extractFolderName(fileOrPath:string) {
  if (fileOrPath.endsWith('/'))
    fileOrPath = trimEndChars(fileOrPath,['/']);
  if (fileOrPath.endsWith(':'))
    return '';
  return extractFileName(fileOrPath);
}

/**
 * this extracts the path part of a file, or the parent path of a path.  ex: /home/admin/file.txt returns /home/admin/.
 * Extracting the path from /home/admin/ returns /home/.
 */
export function extractPath(fileOrPath:string):string {
  fileOrPath = trimEndChars(fileOrPath,['/','\\']);
  let fileName = extractFileName(fileOrPath);
  return internalizePath( fileOrPath.substr(0,fileOrPath.length - fileName.length) );
}

/**
 * returns the extension of a file. It always includes the leading dot.  If there are multiple extensions, it only returns the last one.
 */
export function extractFileExt(file:string):string {
  let i = file.lastIndexOf('.');
  if (i == -1)
    return '';
  return file.substr(i);
}

export function removeFileExt(file:string):string {
  return file.replace(/\.[^\.]*$/g,'');
}

export function trimPathEndSlash(s:string):string {
  return trimEndChars(s,['/','\\']);
}

export function forwardSlashes(file:string) {
  return file.replace(/\\/g,'/');
}

/**
 * returns the root folder path of a path or file. ex `c:/data/test.ts` --> `c:/` or `/home/joe/` --> `/`
 */
export function getRootPath(pathOrFile:string) {
  return forwardSlashes(nodePath.parse(pathOrFile).root);
}

export function isRoot(path:string) {
  let rootPath = getRootPath(path);
  if (rootPath == '')
    return true;
  return (rootPath == path);
}

export type SlashString = '/' | '\\';

export function addPathEndSlash(s:string, slash:SlashString = '/'):string {
  if (s == '')
    return '';
  if (s.endsWith('/') || s.endsWith('\\'))
    return s;
  return s+slash;
}

/**
 * the internal path structure for the app is as follows:
 * Windows:  c:/folder/
 * Mac/Linux: /folder/
 *
 * notice that for all platforms, we're using forward slashes, and paths always end with a forward slash.
 * Furthermore, there is no such thing as a "path to a folder".  The thing that specifies the folder is the path.
 */
export function internalizePath(path:string):string {
  return addPathEndSlash(forwardSlashes(path));
}

/**
 * the internal full file path (aka "file") structure for the app is as follows:
 * - Windows:  c:/folder/file.ext
 * - Mac/Linux: /folder/file.ext
 *
 * notice that for all platforms, we're using forward slashes
 */
export function internalizeFile(path:string):string {
  return forwardSlashes(path);
}

export function isAbsolutePath(fileOrPath: string) {
  return (startsWith(fileOrPath,'/') || fileOrPath.substr(1,2) == ':/');
}

export function isRelativePath(fileOrPath: string) {
  return (startsWith(fileOrPath,'./') || fileOrPath.substr(1,2) == '../');
}

/**
 * if `toPathOrFile` doesn't have a relative path to `fromPath`, the `toPathOrFile` is returned.
 * Note that if `toPathOrFile` is not an absolute path, this will attempt to return a best guess
 * for the absolute path to `toPathOrFile`.
 */
export function getRelativePath(fromPath:string, toPathOrFile:string):string {
  let result = nodePath.relative(fromPath,toPathOrFile);
  if (endsWith(toPathOrFile,'/'))
    result = internalizePath(result);
  else
    result = internalizeFile(result);

  // fix any paths that aren't absolute and don't start with a '.'
  if (!isAbsolutePath(result))
    if (!result.startsWith('.'))
      result = './'+result;

  return result;
}

/**
 * Takes a full file path passed in with @param file and reduces it to the @param maxLength.  See the following examples:
 * if @Param File is "C:\Users\Test\My Documents\orders.txt" the function @returns these results:
 * maxLength=6  -->  "order…"
 * maxLength=15  -->  "C:\…\orders.txt"
 * maxLength=21  -->  "C:\Users\…\orders.txt"
 * maxLength=30  -->  "C:\Users\…Documents\orders.txt"
 */
export function shortenFile(file:string, maxLength:number):string {
  let fileName = extractFileName(file);
  let filePath = extractPath(file);
  let result = ellipsisEnd(fileName,maxLength);
  if (hasEllipsis(result))
    return result

  return ellipsisCenter(filePath, maxLength - fileName.length) + fileName;
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
    path = extractPath( trimPathEndSlash(path) );
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
  let path = trimStartStr(pathOrFile,root);
  if (! path.endsWith('/'))
    path = extractPath(pathOrFile);
  path = trimEndChars(path,['/']);
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
  return internalizeFile(nodePath.resolve(fromPath,toRelativeOrAbsoluteFile));
}

/**
 * if `toRelativeOrAbsolutePath` is relative, it adds the `fromPath` and returns the path.  If it is already absolute,
 * it simply returns the value of `toRelativeOrAbsolutePath`.
 */
export function resolvePath(fromPath:string, toRelativeOrAbsolutePath:string):string {
  return internalizePath(nodePath.resolve(fromPath,toRelativeOrAbsolutePath));
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

export async function writeFile(file:string, buffer:Uint8Array):Promise<void> {
  return fsp.writeFile(file, buffer, {encoding:'binary'});
}

export async function readFileBytes(file:string, byteCount:number):Promise<Uint8Array> {
  let chunks:Buffer[] = [];
  let stream = fs.createReadStream(file, { encoding: 'binary', start: 0, end: byteCount-1 });
  for await (let chunk of stream)
    chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export function readFileSync(file:string):Uint8Array {
  return fs.readFileSync(file);
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

// math ////////////////////////////////////////////////////////////////////////////////
export function frac(num:number) {
  return num % 1;
}

/**
 * returns the digit at the position in the number.  A negative position will count starting from the right
 * of the number.  Examples:
 * ```
 * digitAt(123, 3)     // 3
 * digitAt(123.45, 6)  // 5
 * digitAt(123.45, -1) // 5
 * ```
 */
export function digitAt(num:number|bigint, position:number) {
  return parseInt(num.toString().substr(position,1))
}


export function isBetween(x:number, low:number, high:number):boolean {
  return x >= low && x <= high;
}

export function decimalCount(value:number) {
  if (Math.floor(value) !== value)
    return value.toString().split(".")[1].length || 0;
  return 0;
}

export function times10ToThe(num:bigint, power:number):bigint {
  if (power == 0)
    return num
  else if (power < 0)
    return num / 10n**BigInt(-power);
  return num * 10n**BigInt(power);
}


// regex ////////////////////////////////////////////////////////////////////////////////
/**
 * escapes a string so that it can appear in a regex as a literal string (without triggering any regex functionality)
 */
export function escapeRegex(s:string) {
  return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); // '$&' repl means the whole matched string
}

// strings /////////////////////////////////////////////////////////////////////////////////
type StringableRest = (string | number | null | unknown | string[] | number[])[];

export function splice(s:string, index:number, deleteCount:number, addString:string) {
  // handle negative indexes
  if (index < 0) {
    index = s.length + index;
    if (index < 0) {
      index = 0;
    }
  }

  return s.slice(0, index) + addString + s.slice(index + deleteCount);
}

/**
 * concat with separator
 */
//export function concatWS(separator:string, items:[]):string; // <-- dunno why this isn't ok....
export function concatWS(separator:string, ...items:StringableRest):string {
  let result = '';
  let sep = '';
  if (typeof items[0] !== 'undefined' && Array.isArray(items[0]))
    items = items[0];

  items.forEach( item => {
    if (item == null || item == '') {
      // no nothing
    } else {
      result += sep + item;
      sep = separator;
    }
  });
  return result;
}

export function concat(...items:string[]):string {
  let result = '';
  items.forEach( item => {
    if (item == null || item == '') {
      // no nothing
    } else {
      result += item;
    }
  });
  return result;
}

export function startsWith(s:string, prefix:string, caseSensitive:boolean = false):boolean {
  if (caseSensitive)
    return s.startsWith(prefix)
  else
    return s.toLowerCase().startsWith(prefix.toLowerCase());
}

export function endsWith(s:string, suffix:string, caseSensitive:boolean = false):boolean {
  if (caseSensitive)
    return s.endsWith(suffix)
  else
    return s.toLowerCase().endsWith(suffix.toLowerCase());
}


export function sameText(a:string, b:string):boolean {
  return a.toLowerCase() == b.toLowerCase();
}

export function containsText(haystack:string, needle:string):boolean;
export function containsText(haystack:string[], needle:string, arraySubstringMatch?:boolean):boolean;
export function containsText(haystack:string | string[], needle:string, arraySubstringMatch:boolean = false):boolean {
  if (Array.isArray(haystack)) {
    for (let s in haystack) {
      if (arraySubstringMatch) {
        if (s.toLowerCase().indexOf(needle.toLowerCase()) >= 0)
          return true;
      } else {
        if (s.toLowerCase() == needle.toLowerCase())
          return true;
      }
    }
  } else
    return haystack.toLowerCase().indexOf(needle.toLowerCase()) >= 0;
  return false;
}

export function isBlank(s:string|number|null|undefined):boolean {
  return (s == null || s == '');
}

export function firstNonBlank( ...items:StringableRest):string {
  let result = '';
  if (typeof items[0] !== 'undefined' && Array.isArray(items[0]))
    items = items[0];

  for (let item of items) {
    if (item == null || item == '') {
      // no nothing
    } else {
      result += item;
      break;
    }
  };
  return result;
}

export function ifBlank(s:string|null|undefined,then:string|number):string;
export function ifBlank(s:number|null|undefined,then:number):number;
export function ifBlank(s:string|number|null|undefined,then:string|number):string|number {
  if (isBlank(s))
    return then;
  else
    return s ?? then;
}

export function prefix(pfx:string,s:string):string {
  return (isBlank(s) ? '' : pfx + s);
}

export function suffix(s:string, sfx:string):string {
  return (isBlank(s) ? '' :  s + sfx);
}

export function infix(pfx:string, s:string, sfx:string):string {
  return (isBlank(s) ? '' : pfx + s + sfx);
}

export function spaces(...items:StringableRest):string {
  return concatWS(' ',...items);
}

export function commas(...items:StringableRest):string {
  return concatWS(',',...items);
}

export function commaSpaces(...items:StringableRest):string {
  return concatWS(', ',...items);
}

export function newLines(...items:StringableRest):string {
  return concatWS('\n',...items);
}

export function parens(s:string):string {
  return infix('(',s,')');
}

export function braces(s:string):string {
  return infix('{',s,'}');
}
export function brackets(s:string):string {
  return infix('[',s,']');
}

/**
 * returns the `count` number of characters from the beginning of `s`
 */
export function start(s:string,count:number) {
  return s.substr(0,count);
}

/**
 * returns the `count` number of characters from the end of `s`
 */
export function end(s:string,count:number) {
  return s.substr(s.length - count);
}

export function trimStartChars(s:string, chars:string[]):string {
  chars = chars.map( ch => escapeRegex(ch) );
  let regex = new RegExp('^('+concatWS('|',chars)+')+','g');
  return s.replace(regex,'');
}

export function trimEndChars(s:string, chars:string[]):string {
  chars = chars.map( ch => escapeRegex(ch) );
  let regex = new RegExp('('+concatWS('|',chars)+')+$','g');
  return s.replace(regex,'');
}

export function trimStartStr(s:string, trimString:string, caseSensitive:boolean = false) {
  if (startsWith(s,trimString,caseSensitive))
    return s.substr(trimString.length);
  return s;
}

/**
 * similar to {@link trimEndChars} except this returns the string that would have been trimmed off of the end.
 */
export function getEndChars(s:string, chars:string[]):string {
  chars = chars.map( ch => escapeRegex(ch) );
  let regex = new RegExp('('+concatWS('|',chars)+')+$','g');
  let match = s.match(regex);
  if (match)
    return match[0]
  else
    return '';
}


export function trimChars(s:string, chars:string[]):string {
  return trimEndChars( trimStartChars( s , chars), chars);
}

export function removePrefix(s:string, pfx:string):string {
  return (startsWith(s, pfx) ? s.substr(pfx.length) : s );
}

export function ellipsisEnd(s:string,maxLength:number):string {
  if (maxLength <= 1)
    return '';
  if (s.length > maxLength)
    return start(s,maxLength-1) + '…';
  return s;
}

export function ellipsisStart(s:string,maxLength:number):string {
  if (maxLength <= 1)
    return '';
  if (s.length > maxLength)
    return '…' + end(s,maxLength-1);
  return s;
}

export function ellipsisCenter(s:string,maxLength:number):string {
  if (maxLength <= 1)
    return '';
  if (s.length > maxLength) {
    let halfMaxLength = Math.floor(maxLength / 2);
    return start(s,halfMaxLength) + '…' + end(s,halfMaxLength-1);
  }
  return s;
}

export function hasEllipsis(s:string):boolean {
  return s.indexOf('…') > -1;
}


export function capitalize(s:string) {
  let firstCP = s.codePointAt(0) ?? 0;
  let i = firstCP > 0xFFFF ? 2 : 1;

  return String.fromCodePoint(firstCP).toUpperCase() + s.slice(i);
}

export function byteToString(byte:number):string {
  return String.fromCharCode(byte)
}

export function numberToString(num:number | bigint):string {
  return num.toLocaleString('fullwide',{useGrouping:false,maximumFractionDigits:20});
}

export function countLines(s:string):number {
  return (s == '' ? 0 : s.split(/\r\n|\r|\n/).length);
}

/**
 * returns the line and character position of the index taking newlines into consideration
 */
export function indexToCoorinates(s:string, index:number):{line:number, character:number} {
  let beginningText = s.substr(0,index);
  let line = (beginningText.match(/\n/g)?.length ?? 0);
  let character = beginningText.length - beginningText.search(/(\n).*$/) - 1;
  return {line, character};
}

export function byteToPrintableString(byte:number):string {
  if (byte >= 32 || byte == 13 || byte == 10)
    return String.fromCharCode(byte)
  return '{'+byte+'}';
}

export function byteToHexString(byte:number):string {
  return byte.toString(16);
}

export function stringToBuffer(s:string): Uint8Array {
  return Buffer.from(s);
}

export function bufferToString(buffer:any[] | Uint8Array):string {
  let result = '';
  for (let byte of buffer) {
    if (typeof byte == 'number')
      result += byteToString(byte);
    else
      result += '?';
  };
  return result;
}

export function bufferToPrintableString(buffer:any[] | Uint8Array):string {
  let result = '';
  for (let byte of buffer) {
    if (typeof byte == 'number')
      result += byteToPrintableString(byte);
    else
      result += '?';
  };
  return result;
}

export function bufferToHexString(buffer:any[] | Uint8Array):string {
  let result = '';
  for (let byte of buffer) {
    if (typeof byte == 'number')
      result += '('+byteToHexString(byte)+')';
    else
      result += '?';
  };
  return result;
}

export function bufferToByteString(buffer:any[] | Uint8Array):string {
  let result = '';
  for (let byte of buffer) {
    if (typeof byte == 'number')
      result += '('+String(byte)+')';
    else
      result += '?';
  };
  return result;
}

/**
 * replaces all occurances of @param substring in @param searchString with @param replaceWith.
 *
 * The non regex form of String.replace: `String.replace(string,string)` only replaces the first occurance.
 * However, if you use the `String.replace(regex,string)` form of the call, and use a global regex, you can
 * replace all occurances.
 *
 * Note: as of Aug 2020, the ECMAScript spec includes a new String.replaceAll() function.
 */
export function replaceAll(searchString:string,substring:string,replaceWith:string):string {
  let regex = new RegExp(escapeRegex(substring), 'g');
  return searchString.replace(regex, replaceWith);
}

/**
 * takes a string of "kebab-case" or "snake_case" and returns "camelCase".
 */
export function camelCase(s:string) {
  return s.replace(/([-_][a-zA-Z])/g, group =>
    group.toUpperCase().replace('-', '').replace('_', '')
  );
}

/**
 * takes a string of "kebab-case", "snake_case", or "camelCase" and returns a string with each word separated by a space.  Capitalization is left as is.
 */
export function separateIdentifier(s: string) {
  return s.replace(/([-_][a-zA-Z]|[A-Z])/g, group =>
    ' ' + group.replace('-', '').replace('_', '')
  );
}

/**
 * lowers the case of the first letter of a string if it isn't already.
 */
export function lowerCaseFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.substr(1);
}

/**
 * capitalizes the first letter of a string if it isn't already.
 */
export function upperCaseFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.substr(1);
}

/**
 * replaces JavaScript escape sequences with actual characters
 * thanks to: https://stackoverflow.com/questions/6640382/how-to-remove-backslash-escaping-from-a-javascript-var
 */
export function unescapeSlashes(s:string) {
  // add another escaped slash if the string ends with an odd
  // number of escaped slashes which will crash JSON.parse
  let parsedStr = s.replace(/(^|[^\\])(\\\\)*\\$/, '$&\\');

  try {
    parsedStr = JSON.parse(`"${parsedStr}"`);
  } catch(e) {
    return s;
  }
  return parsedStr ;
}

/**
 * splits a string into an array by the newlines.  Since this is designed to handle windows and unix style line endings, the
 * ending found at the end of each line is saved along with the text of the line.
 */
export function strToLines(s:string):{line:string, newLine:string}[] {
   let result = [];
   let matches = Array.from(s.matchAll(/\r\n|\n/g));
   let p = 0;
   for (let match of matches) {
     result.push({
       line:s.substring(p,match.index!),
       newLine:match[0]
     });
     p = match.index! + match.length;
   }
   let lastText = s.substr(p);
   if (lastText != '')
     result.push({
      line:lastText,
      newLine:''
     });
   return result;
}

/**
 * indents each line in a multiline string by the amount specified in the `indents` params.
 * @param s the multiline string
 * @param indents indicates the number of spaces to indent each line starting from the first line. The last entry
 * will be the amount of space to indent for the remainder of the lines encountered.
 */
export function indent(s:string, size:number|number[], indentCharacter:string = ' ') {
  if (!Array.isArray(size))
    size = [size];
  let lines = strToLines(s);
  let result = '';
  let indentIndex = 0;
  for (let item of lines) {
    result += (indentCharacter.repeat(size[indentIndex]) + item.line).trimEnd() + item.newLine;
    if (indentIndex < size.length-1)
      indentIndex++;
  }
  return result;
}


/**
 * internal function for the "L" function which is used as a "tag" for template strings.
 * @see [L](#L) the "L" function in this module
 */
export function lineUpWithCode(templateStrings:TemplateStringsArray,...params:(string|number)[]):string {
  let fullUnescaped = templateStrings.raw.join('$');  // <-- starts us off with something like '\n   this $ is\n   a template'
  let matches = Array.from( fullUnescaped.matchAll(/(\r\n|\n|\\r\\n|\\n)(\s*)(\S)/g) ); // <-- matches <newline sequence><spaces><first non space char>
  let removeSpaces = Number.MAX_SAFE_INTEGER;
  for (let match of matches) {
    let spaces = trimStartChars(match[2] ?? '',['\n','\r']);
    removeSpaces = Math.min(spaces.length,removeSpaces);
  }

  // remove the leading newline
  if (matches[0] && typeof matches[0][1] == 'string') {
    matches[0][1] = '';
  }

  // remove spaces
  let p = matches[0]?.index ?? 0;   // <-- starts off at the index of the first match therefore skipping any characters on the first line, which is supposed to be empty
  let linedUpString = '';
  for (let match of matches) {
    linedUpString +=
      fullUnescaped.substring(p,match.index) +              // <-- the text from the prior line
      match[1] +                                            // <-- the newline character(s) from the prior line
      match[2].substr(0, match[2].length - removeSpaces) +  // <-- trims down the space starting from the end of match[2]
      (match[3] == '|' ? '' : match[3]);                    // <-- removes any starting pipes
    p = match.index! + match[0].length;                     // <-- moves p to the point after the match
  }

  // at this point p is sitting on the first character after the last <newline><spaces><non-space> character.
  // the only possible remaining pattern is <non-spaces>[newline][spaces].  So, we will always grab the
  // text from p to the newline or the end of the string if there is no newline.  Then we have to decide
  // if the spaces after the newline should be trimmed and kept, or all thrown away
  let remaining = fullUnescaped.substr(p);
  let newLineMatch = remaining.match(/(\r\n|\n|\\r\\n|\\n)/);
  if (newLineMatch && (newLineMatch.index != null)) {
    linedUpString += remaining.substring(0,newLineMatch.index + newLineMatch[0].length);
    remaining = remaining.substr(newLineMatch.index + newLineMatch[0].length); // <-- get everything after the newline, which should be spaces
    remaining = remaining.substr(0, remaining.length - removeSpaces) // <-- trim down the spaces
  }
  linedUpString += remaining

  // replace params - we can't simply use unescapeslashes() and replace the dollar signs because the template string may contain them
  let result = '';
  let i = 0;
  p = 0;
  for (let match of linedUpString.matchAll(/(?<!\\)\$/g) ) {  // <-- finds all unescaped dollar signs
    result += unescapeSlashes(linedUpString.substring(p, match.index)) + (params[i++] ?? '');   // <-- unescapes the template strings before the dollar sign, then add the next param
    p = match.index! + 1;
  }
  result += unescapeSlashes(linedUpString.substr(p));  // <-- remaining text at the end of the string

  return result;
}

/**
 * "L" stands for "Line up with code" and is a tag for template strings that ensures any extra
 * indent space in your template string is eliminated. for example:
 * ```
 * function getString() {
 *   return L`
 *     <div>
 *       this is a div
 *     </div>
 *   `;
 * ```
 * will return a string that looks like
 * ```
 * '<div>\n  \nthis is a div\n</div>'
 * ```
 * -- that is, the 4 indent spaces from the code will be removed.  Templates must always
 * begin with a new line and the first non whitespace character after the new line is
 * considered to mark the end of the code's indent space.  In the example above, the first "<"
 * character is indented 4 spaces into the code, so, 4 spaces will be removed from the
 * beginning of each line.
 *
 * You may also use the pipe character "|" to identify the end of the indent space like so:
 * ```
 * function getString() {
 *   return L`
 *     |    this is indented, but
 *          not as much as it would ordinarily be.
 *   `;
 * }
 * ```
 * this will return
 * ```
 * '    this is indented, but\n    not as much as it would ordinarily be.'`
 * ```
 *
 * You may also use multiple pipes to create a visual barrier between the code's indent space, and
 * your string's indent space:
 * ```
 * function getString() {
 *   return L`
 *     |    this is the bottom half
 *     |    of a nested html block.
 *     |  </p>
 *     |</div>
 *   `;
 * ```
 * note that you will always need to escape any pipe characters with a backslash in your template
 * string that you want to be included in the string. The above example will even work without any pipes
 * because the indent will be calculated based on the left most character of any line. for example:
 * ```
 * function getString() {
 *   return L`
 *         this is the bottom half
 *         of a nested html block.
 *       </p>
 *     </div>
 *   `;
 * ```
 * returns the same string as the above example that has a pipe for each line.
 */
export function L(templateStrings:TemplateStringsArray,...params:(string|number)[]):string {
  return lineUpWithCode(templateStrings,...params);
}

/**
 * converts a string template into a properly encoded URL.  You can use this
 * to present URLs in your code as multiline indented strings.  The resulting
 * URL will have all of the whitespace removed. Ex.
 * ```
 * window.open(U`
 *   http://mydomain.com?
 *     user=${user}&
 *     page=${page}
 * `);
 * ```
 */
export function U(templateStrings:TemplateStringsArray,...params:(string|number)[]):string {
  let result = '';
  let i = 0;
  for (let s of templateStrings)
    result += s.replace(/\s/g,'') + encodeURIComponent(params[i++] ?? '');
  return result;
}


export function getDecimalSeparator(locale = '') {
  const numberWithDecimalSeparator = 1.1;
  let parts = Intl.NumberFormat(locale).formatToParts(numberWithDecimalSeparator);
  return parts.find(part => part.type === 'decimal')?.value ?? '.';
}

export function getThousandsSeparator(locale = '') {
  const numberWithThousandsSeparator = 1000;
  let parts = Intl.NumberFormat(locale).formatToParts(numberWithThousandsSeparator);
  return parts.find(part => part.type === 'group')?.value ?? ',';
}


export function removeChars(s:string, removeFunc:(ch:string) => boolean):string {
  let result = '';
  for (let ch of s)
    if (!removeFunc(ch))
      result += ch;
  return result;
}

export function parseFloatLocale(numericString:string, locale = '') {
  let decimalSeparator = getDecimalSeparator(locale);
  numericString = removeChars(numericString, ch => (ch < '0' || ch > '9') && ch != decimalSeparator && ch != '(' && ch != '-');
  let possibleNegativeSign = numericString.substr(1,1);
  let isNegative = possibleNegativeSign == '-' || possibleNegativeSign == '(';
  numericString = removeChars(numericString, ch => (ch < '0' || ch > '9') && ch != decimalSeparator);
  if (decimalSeparator != '.')
    numericString = numericString.replace(decimalSeparator,'.');
  return parseFloat(numericString) * (isNegative ? -1 : 1);
}

/**
 * (s)ingular (p)lural - returns the number concatinated with the `singular` param if the number == 1 or else, it returns `plural`.
 * See `spHide()` to do the same thing without including the number.
 * @param num can be a number or a formatted floating point string of any non-scientific format, like: $400.45 or -200 or
 * (3,056.792). When sending a formatted string, the `locale` parameter is used to interpret the number.
 * @param singluar the string that gets concatenated to the number 1
 * @param plural the string that gets concatenated to numbers not equal to 1
 * @param locale used to interpret the `num` parameter if it's a formatted string, mainly to figure out the commas and
 * periods.  Leave blank to use the system's default locale.
 */
export function sp(num:number | string, singluar:string, plural:string, locale = ''):string {
  let parsedNum:number;
  if (typeof num == 'number')
    parsedNum = num
  else
    parsedNum = parseFloatLocale(num);
  return String(num + (parsedNum == 1 ? singluar : plural));
}

/**
 * (s)ingular (p)lural + (Hide) the number - returns the `singluar` param if the number == 1 or else, it returns `plural`.
 * See `sp()` to do the same thing while including the number in the output.
 */
export function spHide(num:number, singluar:string, plural:string):string {
  return (num == 1 ? singluar : plural);
}

/**
 * returns the position of the next occurance of newline, or the position of the first character
 * after the end of the string.
 */
export function getNextNewlinePos(s:string, startPos:number) {
  let p = startPos;
  while (p < s.length) {
    let ch = s.substr(p,1);
    if (ch == '\r' || ch == '\n')
      break;
    p++;
  }
  return p;
}

/**
 * returns the position of the prior occurance of newline, or -1 if not found. Note that if the
 * newline consists of the 2 character \r\n, the result will point to the \n character.
 */
export function getNextNewlinePosR(s:string, startPos?:number) {
  if (startPos == null)
    startPos = s.length-1;
  let p = startPos;
  while (p >= 0) {
    let ch = s.substr(p,1);
    if (ch == '\r' || ch == '\n')
      break;
    p--;
  }
  return p;
}




// functions ////////////////////////////////////////////////////////////////
export function def(param:any,defaultValue:any) {
  if (param == null)
    return defaultValue;
  else
    return param;
}

export async function sleep(ms:number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * turns a function into a debounced function
 */
export function makeDebounceFunc(waitMSec:number, func: Function) {
  let timer:NodeJS.Timeout;
  return function (this:any, ...args:any[]) {
    clearTimeout(timer);
    timer = setTimeout( () => func.apply(this, args), waitMSec);
  }
};


let debounceMap = new Map<any,NodeJS.Timeout>();
/**
 * calls func once within a wait limit.
 * @param context a unique identifier for this debounce situation
 */
export function debounce(context:any, waitMSec:number, func: () => void) {
  let item = debounceMap.get(context);
  if (item)
    clearTimeout(item);
  debounceMap.set(context, setTimeout( () => {
    debounceMap.delete(context);
    func();
  }, waitMSec) );
}


// urls ////////////////////////////////////////////////////////////////

export function urlParamsToObject(url:string) {
  let u = new URL(url);
  let result:any = {};
  u.searchParams.forEach((value,key)=> {
    result[key] = value;
  });
  return result;
}

// arrays //////////////////////////////////////////////////////////////////////

/**
 * takes an Iterable and executes a callback on each element.  The callback should either return a new value to represent the
 * element or undefined/null to ignore this value thereby reducing the count of the result array.
 */
export function transform<T>(iterable:Iterable<any>, callback:(value:any, key: any, index: number)  => T|undefined ): T[] {
  let result:any[] = [];
  let index:number = 0;
  for (let [key,value] of iterable) {
		let item = callback(value, key, index++);
		if ( typeof item != 'undefined' && item != null )
      result.push(item);
  }
	return result;
}

/**
 * converts an array into a type T using the callback.  Let your callback work on building T based on the array elements.
 * if the callback returns false, the processing will end.
 */
export function evolve<T>(iterable:Iterable<any>, result:T, callback:(resultContainer:{result:T}, value:any, index:number) => boolean | void):T {
  let index:number = 0;
  let resultContainer = {result};
  for (let value of iterable) {
		let cbResult = callback(resultContainer, value, index++);
		if (typeof cbResult == 'boolean' && cbResult == false)
      break;
  }
	return result;
}

export function hasItem(iterable:Iterable<any>, searchItem:any, caseSensitive = false) {
  for (let item of iterable) {
    if (caseSensitive || typeof searchItem != 'string') {
      if (item == searchItem)
        return true;
    } else {
      if (sameText(item,searchItem))
        return true;
    }
  }
  return false;
}

// objects //////////////////////////////////////////////////////////////////////

interface LooseObject {
  [key: string]: any
}

/**
 * @returns a new object consisting of members from the members array.
 * Note that object members (non literals) will be references, not new objects
 * @param obj source object
 * @param members members to copy into a new object
 */
export function pick(obj: LooseObject, members: Array<string>):object {
	// Create new object
	var result:LooseObject = {};

	// Loop through props and push to new object
	members.forEach(function(prop: string) {
		result[prop] = obj[prop];
	});

	// Return new object
	return result;
};

/**
 * creates a new object with all of the properties in @param model supplemented with any additional properties in @param additional
 */
export function setUndefined(model: LooseObject, additional: LooseObject):object {
	// Create new object
  var result:LooseObject = {...model};

  // Loop through src and push to dest object if dest doesn't have it
	for (let prop in additional) {
    if (result[prop] == null)
		  result[prop] = additional[prop];
  }

  return result;
}

/**
 * @returns the key as a string or undefined if the value was not found
 * @param obj is the object to search in
 * @param value is the value to find
 */
export function getKeyByValue(obj:LooseObject, value:any):string|undefined {
  return Object.keys(obj).find(key => obj[key] === value);
}

export function isObject(obj:any):boolean {
  return (obj != null) && (typeof obj == 'object')
}

export function isArray(a:any):boolean {
  return Array.isArray(a) || ArrayBuffer.isView(a) && !(a instanceof DataView)
}


export function logInstanceOf(object:any, constructor:any) {
  let s = '';
  let isFound = false;
  let items:string[] = [];

  if (object == null)
    return;

  object = object.__proto__;

  console.log('[checking if "'+object.constructor.name+'" is a subclass of "'+constructor.name+'"]');

  while (object != null) {
    s = object.constructor.name;
    if (object == constructor.prototype) {
      isFound = true;
      s += ' <-- found "'+constructor.name+'"'
    } else if (s == constructor.name) {
      s += ' <-- *** names match, but is a different constructor';
    }
    items.push(s);
    object = object.__proto__;
  }

  let arrow = '';
  let indent = 0;
  for (let i = items.length-1; i >= 0; i--) {
    console.log('  '.repeat(indent++) + arrow + items[i]);
    arrow = ' ⮤ ';
  }
  if (! isFound)
    console.log('    '.repeat(indent)+'** could not find "'+constructor.name+'" **');
}

/**
 * same as using `instanceof` except it compares the class names instead of the actual class types
 * This is therefor not as exact as `instanceof`.
 */
export function likelyInstanceOf(object:any, constructor:any) {
  if (object == null)
    return false;
  object = object.__proto__;
  while (object != null) {
    if (object.constructor.name == constructor.name)
      return true;
    object = object.__proto__;
  }
  return false;
}

// enums ///////////////////////////////////////////////////////////////////////////////////////

export interface EnumType {
  [key: string]: number|string
}

export type EnumValue = number|string;

/**
 * @returns the next value from an enum in the following forms:
 *  - `enum Sizes {small,medium,large}`
 *  - `enum Sizes {small="S",medium="M",large="L"}`
 *
 * examples:
 *  - `incEnum<Sizes>(Sizes, Sizes.small) => Sizes.medium`
 *
 * the step parameter indicates the number of enumeration elements to skip:
 *  - `incEnum<Sizes>(Sizes, Sizes.small, 2) => Sizes.large`
 *
 * use a negative step to move backwards:
 *  - `incEnum<Sizes>(Sizes, Sizes.large, -1) => Sizes.medium`
 *
 * moving beyond the beginning or end of the enumeration will wrap to the opposite side:
 *  - `incEnum<Sizes>(Sizes, Sizes.large, 2) => Sizes.medium`
 *
 * the number of wraps is unlimited:
 *  - `incEnum<Sizes>(Sizes, Sizes.medium, 5) => Sizes.small`
 *
 * @param value the starting enumeration value
 * @param enumeration the enumeration object to work on
 * @param step number of elements to advance or back up
 */
export function incEnum<T extends EnumValue>(enumObj: EnumType, enumValue: T, step = 1):T {
  // Get the list of keys in the enum.  Filter out the numeric reverse mapping if present.
  let keys = Object.keys(enumObj).filter( key => isNaN(<any>key) );

  // find the current key based on the passed in enumValue
  let nextKey = null;
  keys.some((key,index)=>{
    if (enumObj[key] == enumValue) {

      // get the next key according to the step param
      let nextIndex = index + step;

      // wrap the index of the keys if it goes beyond the boundaries of the key array
      if (nextIndex < 0)
        nextIndex = keys.length + (nextIndex % keys.length);
      else
        nextIndex = nextIndex % keys.length;
      nextKey = keys[nextIndex]

      // break out of the 'some' method
      return true;
    }
  });
  if (!nextKey)
    throw new Error('incEnum: enumObj has no keys');
  return <T>enumObj[nextKey];
}

/**
 * converts a number (or string) to a proper enum value
 * @param enumObj
 * @param enumValue is the number or string to convert
 * @param defaultValue returns this if the enumValue is not in the enumObj
 */
export function toEnum<T extends EnumValue>(enumObj: EnumType, enumValue: EnumValue, defaultValue?:EnumValue):T {
  // Get the list of keys in the enum.  Filter out the numeric reverse mapping if present.
  let keys = Object.keys(enumObj).filter( key => isNaN(<any>key) );
  let found = keys.some((key)=> {
    if (enumObj[key] == enumValue)
      return true;
  });
  if (found)
    return <T>enumValue;
  else {
    if (defaultValue)
      return <T>defaultValue;
    else
      throw new Error('Value "'+enumValue+'" does not exist in enum: "'+keys.toString+'"');
  }
}

/**
 * takes an enum flags
 */
export function inEnumFlags(flags:number, enumValue:number):boolean {
  return ((flags && enumValue) === enumValue);
}

export function enumAsName(enumObj: EnumType, enumValue:number):string {
  for (let key in enumObj) {
    if (enumObj[key] === enumValue)
      return key;
  }
  return '';
}


// classes /////////////////////////////////////////////////////////////////////


export function getClassName(obj:object) {
  return obj.constructor.name;
}


// arrays  //////////////////////////////////////////////////////////////////////////

/**
 * @member isFound indicates if the search found the item
 * @member index indecates the location of the found item.
 * If the item was not found, index contains the location where the item should be inserted. Specifically
 * it is the index where the inserted item should be placed. If there are no items in the array, the index
 * will be 0.  If there is 1 item, the index will be either 0 or 1, with 0 meaning that the item should
 * become the first item, and 1 meaning the item should become the last item.
 */
interface ArraySearchResult {
  isFound:boolean;
  index:number;
}

/*
 * - when a < b the comparator's return value should be a negative number
 * - when a > b the comparator's return value should be a positive number
 * - when a == b the return value should be 0
 */
export type Comparator<T> = (a: T, b: T) => number;

/**
 * Thanks to https://github.com/darkskyapp/binary-search for the algorithm.
 * @param haystack the array you're lookin in
 * @param needle the thing you're looking for
 * @param comparator allows for custom sort comparison
 * ------------------------------------------------------------------------------
 * returns and interface: ArraySearchResult
 * @member isFound indicates if the search found the item.
 * @member index indecates the location of the found item.
 * - If the item was not found, index contains the location where the item should be inserted. Specifically
 * it is the index where the inserted item should be placed. If there are no items in the array, the index
 * will be 0.  If there is 1 item, the index will be either 0 or 1, with 0 meaning that the item should
 * become the first item, and 1 meaning the item should become the last item.
 */
export function binarySearch<T>(haystack: ArrayLike<T>, needle: T,  comparator: Comparator<T>): ArraySearchResult {
  let mid, cmp;
  let low = 0;
  let high = haystack.length - 1;

  while(low <= high) {
    // The naive `low + high >>> 1` could fail for array lengths > 2**31
    // because `>>>` converts its operands to int32. `low + (high - low >>> 1)`
    // works for array lengths <= 2**32-1 which is also Javascript's max array
    // length.
    mid = low + ((high - low) >>> 1);
    cmp = comparator(haystack[mid], needle);

    // Too low.
    if(cmp < 0.0)
      low  = mid + 1;

    // Too high.
    else if(cmp > 0.0)
      high = mid - 1;

    // Key found.
    else
      return {
        isFound: true,
        index: mid
       };
  }

  // Key not found.
  return {
    isFound: false,
    index: low
  };
}

// date & time ////////////////////////////////////////////////////////////////////////
export function unixTime() {
  return Math.floor(Date.now() / 1000);
}


/**
 * returns the elapsed time in days hours minutes seconds and milliseconds where the units used
 * depend on the magnitude of the time input.
 * ex:
 * 1 day 2 hrs 53 min
 * 2 hrs 53 min
 * 10 min 30 sec
 * 18.52 sec
 * 259 msec
 */
export function elapsedTime(msec: number):string {
  const msecPerSecond = 1000;
  const msecPerMinute = msecPerSecond * 60;
  const msecPerHour = msecPerMinute * 60;
  const msecPerDay = msecPerHour * 24;
  let days = Math.trunc(msec / msecPerDay);
  msec -= (days * msecPerDay);
  let hours = Math.trunc(msec / msecPerHour);
  msec -= (hours * msecPerHour);
  let minutes = Math.trunc(msec / msecPerMinute);
  msec -= (minutes * msecPerMinute);
  let seconds = Math.trunc(msec / msecPerSecond);
  msec -= (seconds * msecPerSecond);
  let result = '';
  if (days > 0)
    result = sp(days,' day',' days');
  if (hours > 0)
    result = spaces(result, sp(hours,' hr',' hrs'));
  if (days == 0) {
    if (minutes > 0)
      result = spaces(result, minutes + ' min');
    if (hours == 0) {
      if (seconds > 0)
        result = spaces(result, Number( (seconds + (1/msec)).toFixed(3) ) + ' sec');
      else if (minutes == 0)
        result = spaces(result, msec + ' msec');
    }
  }
  return result;
}


/**
 * @param date a javascript date
 * @param timeZone the zone the date should be converted to.  Leave undefined for the local time zone.
 * @returns a formatted date string in the system locale with a numeric date, ex. `1/1/2020` and a full time including seconds and milliseconds `10:23:55.123`. It will end with am/pm if the locale requires it.
 */
export function getTimeZone(date:Date, timeZone?:string):string {
  let zone = date.toLocaleDateString([], {timeZoneName:'short', timeZone});
  return zone.split(' ').pop() ?? '';
}

/**
 * @param date a javascript date
 * @param timeZone the zone the date chould be converted to.  Leave undefined for the local time zone.
 * @returns a formatted date string in the system locale with a numeric date, ex. `1/1/2020` and a full time including seconds and milliseconds `10:23:55.123`. It will end with am/pm if the locale requires it.
 */
export function getPreciseDate(date:Date, timeZone?:string):string {
  let preciseDate = `${date.toLocaleDateString([], {year:'numeric', month:'2-digit', day:'2-digit', timeZone})} ${date.toLocaleString([], {hour: '2-digit', minute:'2-digit', second:'2-digit', timeZone}).toLocaleLowerCase().replace(' ',' ')}`;
  let match = preciseDate.match(/\d[^\d]+$/); // <-- finds the last digit
  if (match && typeof match.index != 'undefined')
    return splice(preciseDate, match.index+1, 0, `.${String(date.getMilliseconds()).padEnd(3,'0')}`);
  return '<unknown>';
}

export function analyzeDate(date:Date):{
  local:{preciseDate:string, zone:string},
  utc:{preciseDate:string, zone:string}
} {
  return {
    local: {
      zone: getTimeZone(date),
      preciseDate: getPreciseDate(date),
    },
    utc: {
      zone: getTimeZone(date,'UTC'),
      preciseDate: getPreciseDate(date,'UTC'),
    }
  }
}



// html ///////////////////////////////////////////////////////////////////////////////
/**
 * (s)tring to (h)tml
 */
export function sh(s:string):string {
  let result = s.replace(/[\u00A0-\u9999<>\&]/gim, (i) => '&#'+i.charCodeAt(0)+';');
  result = result.replace(/\r?\n/gm,'<br />');
  return result;
}

/**
 * (s)tring to (h)tml (prop)erty - this encodes a string to make it suitable to be inserted into
 * a property tag between double quotes.  ex.
 * ```
 * let multiLineHint = `
 *   multi-line
 *   hint
 * `;
 * let html = `<div title="${multiLineHint}">`;
 * ```
 * in the case above, newlines will become &#13; instead of <br />, which is what happens
 * when using the {@link sh}() function.
 */
export function shProp(s:string):string {
  let result = s.replace(/[\u00A0-\u9999<>\&\"]/gim, (i) => '&#'+i.charCodeAt(0)+';');
  return result;
}

// iterators /////////////////////////////////////////////////////////////////////////////

export function byIndex<T>(iterator:IterableIterator<T>, index:number):{value:T, index:number} | undefined {
  let currentIndex = 0;
  let current:IteratorResult<T>;
  while ( !(current = iterator.next()).done ) {
    if (index == currentIndex)
      return {value: current.value, index};
    currentIndex++;
  }
}

export function first<T>(iterator:IterableIterator<T>):{value:T, index:number} | undefined {
  return byIndex(iterator, 0);
}

export function last<T>(iterator:IterableIterator<T>):{value:T, index:number} | undefined {
  let index = -1;
  let last:IteratorResult<T>;
  let current:IteratorResult<T>;
  while ( !(current = iterator.next()).done ) {
    last = current;
    current = iterator.next();
    index++;
  }
  if (index == -1)
    return;
  return {value:last!.value, index};
}


// events /////////////////////////////////////////////////////////////////////////////

export type SyncEventListener<D,R> = (data:D, eventParams:EventParams<D,R>) =>  R|undefined|void;
export type AsyncEventListener<D,R> = (data:D, eventParams:EventParams<D,R>) => Promise<R|undefined|void>;

export type EventListener<D,R> = SyncEventListener<D,R> | AsyncEventListener<D,R>;

export class EventParams<D,R> {
  private _isCueingStopped = false;
  private _isEventCanceled = false;
  constructor(
    public result:R | undefined,
    public listener:EventListener<D,R>
  ) {}

  public get isCueingStopped() {
    return this._isCueingStopped;
  }

  public get isEventCanceled() {
    return this._isEventCanceled;
  }

  /**
   * prevents any further listeners from being cued. This is the same as `stopImmediatePropagation()`
   * method used in JS DOM element events.
   */
  public stopCues() {
    this._isCueingStopped = true;
  }

  /**
   * prevents any further listeners from being cued and signals to the hosting class that the event
   * should be canceled if possible.  It will then be up to the hosting class to heed the `isEventCancelled`
   * flag.
   */
  public cancelEvent() {
    this.stopCues();
    this._isEventCanceled = true;
  }

}



/**
 * represents an event attached to any object.  Unlike other event systems, this does not require that the class wanting to
 * offer events be a descendant of a specific event class.  Each `Event` can host 0 or more listeners.  Example:
 * ```
 * class car {
 *   private position = 0;
 *   public onMove = new Event<{distance:number},number>; // <-- onMove will be called before a move is actually made so the developer has a chance to change the move amount
 *   public move(distance:number) {
 *     distance = this.onMove.cue({distance},distance);
 *     this.position += distance;
 *   }
 * }
 *
 * let car = new car();
 * car.onMove.do( (eventParams) => {
 *   const maxDistance = 100;
 *   if (eventParams.data.distance > maxDistance)
 *     eventParams.result = 0;
 * });
 * ```
 * When the events are cued, each listener is called and provided with an `eventParams` which contains
 * the members `data` and `result`.  The listener will read any info provided in the `data` member
 * and optionally set the `result` member if a return value is needed.  Also note that the `data` member
 * can be changed and thereby affect other listers yet to be called. The default `result` is determined
 * by a parameter provided when calling the `cue()` method.  `eventParams` can also be used to prevent
 * other listeners from being called by using the `stopCueing()` method.  The listener can also request
 * that the event itself be canceled by calling `cancelEvent()`.  It then will be up to the class hosting
 * the event to heed the cancellation or not.
 *
 * @type D is the type of data passed to each listener
 * @type R is the type of the return data coming from listeners
 */
export class Event<D = undefined,R = undefined> {
  private listeners = new Map<EventListener<D,R>,{once: boolean}>();

  /** when false, calling {@link cue}() will not call any listeners */
  public active = true;

  public get hasListeners():boolean {
    return this.listeners.size > 0;
  }

  /**
   * adds an event listener to the event.  The listener will be executed when the event's `cue()` method is called.
   * Multiple events are executed in the order they are added.
   */
  public do(listener: EventListener<D,R>): EventListener<D,R> {
    this.listeners.set(listener,{once: false});
    return listener;
  }

  /**
   * adds an event listener to the event and makes it the first one to be executed when the `cue()` method is called.
   * Normally, multiple listeners are executed in the order they are added.
   */
  public doFirst(listener: EventListener<D,R>): EventListener<D,R> {
    let oldListeners = this.listeners;
    this.listeners = new Map<EventListener<D,R>,{once: boolean}>([[listener,{once:false}],...oldListeners]);
    return listener;
  }

  /**
   * adds an event listener to be executed the next time the `cue()` method is called, but then removes it from the
   * list of listeners.
   */
  public doOnce(listener: EventListener<D,R>): EventListener<D,R> {
    this.listeners.set(listener,{once: true});
    return listener;
  }

  /**
   * makes the event listener the first to be executed the next time the `cue()` method is called but then removes it from the
   * list of listeners.
   */
  public doOnceFirst(listener: EventListener<D,R>): EventListener<D,R> {
    let oldListeners = this.listeners;
    this.listeners = new Map<EventListener<D,R>,{once: boolean}>([[listener,{once:true}],...oldListeners]);
    return listener;
  }

  public remove(listener: EventListener<D,R>) {
    this.listeners.delete(listener);
  }

  public removeAll() {
    this.listeners.clear();
  }

  /**
   * classes that host the event should execute this method to call the listeners to action.
   * Note that although {@link do}() will accept asyc functions, they will not be awaited when
   * the host object calls cue().  Use {@link AsyncEvent} if the hosting object needs to call
   * `await cue(...)` in order to get a return value from asynchronous listeners.
   * @param data contains arbitrary data that the host wants to pass to the listener.
   * `data` can also be a reference to a function that returns the data. Use a function
   * when there is a performance cost to obtaining the data. That way, the cost will only be
   * incurred if there are actually listeners listening.
   * @param defaultResult what the result will be if the listeners don't assign one before returning.
   */
  public cue():R | undefined;
  public cue(data:D | (() => D), defaultResult?:R ):R | undefined;
  public cue(data:D | (() => D), defaultResult:R ):R;
  public cue(data?:D | (() => D), defaultResult?:R ):R | undefined {
    if (!this.active || this.listeners.size <= 0)
      return defaultResult;
    if (data instanceof Function)
      data = data();
    let eventParams = new EventParams<D,R>(defaultResult,undefined!);
    for (let [listener, params] of this.listeners) {
      if (params.once)
        this.remove(listener);
      eventParams.listener = listener;
      let result = listener(data as any, eventParams);
      if (eventParams.isEventCanceled)
        return defaultResult;
      if (! (result instanceof Promise) && (typeof result != 'undefined'))
        eventParams.result = result;
      if (eventParams.isCueingStopped)
        break;
    }
    return eventParams.result;
  }


}

/**
 * same as the {@link Event} class except events must be asynchronous.  This should mainly
 * be used when the hosting class needs a return value and is able to cue the event
 * asynchronously.
 */
export class AsyncEvent<D = undefined,R = undefined> {
  private listeners = new Map<AsyncEventListener<D,R>,{once: boolean}>();

  /** when false, calling {@link cue}() will not call any listeners */
  public active = true;

  public get hasListeners():boolean {
    return this.listeners.size > 0;
  }

  /**
   * adds an event listener to the event.  The listener will be executed when the event's `cue()` method is called.
   * Multiple events are executed in the order they are added.
   */
  public do(listener: AsyncEventListener<D,R>): AsyncEventListener<D,R> {
    this.listeners.set(listener,{once: false});
    return listener;
  }

  /**
   * adds an event listener to the event and makes it the first one to be executed when the `cue()` method is called.
   * Normally, multiple listeners are executed in the order they are added.
   */
  public doFirst(listener: AsyncEventListener<D,R>): AsyncEventListener<D,R> {
    let oldListeners = this.listeners;
    this.listeners = new Map<AsyncEventListener<D,R>,{once: boolean}>([[listener,{once:false}],...oldListeners]);
    return listener;
  }

  /**
   * adds an event listener to be executed the next time the `cue()` method is called, but then removes it from the
   * list of listeners.
   */
  public doOnce(listener: AsyncEventListener<D,R>): AsyncEventListener<D,R> {
    this.listeners.set(listener,{once: true});
    return listener;
  }

  /**
   * makes the event listener the first to be executed the next time the `cue()` method is called but then removes it from the
   * list of listeners.
   */
  public doOnceFirst(listener: AsyncEventListener<D,R>): AsyncEventListener<D,R> {
    let oldListeners = this.listeners;
    this.listeners = new Map<AsyncEventListener<D,R>,{once: boolean}>([[listener,{once:true}],...oldListeners]);
    return listener;
  }

  public remove(listener: AsyncEventListener<D,R>) {
    this.listeners.delete(listener);
  }

  public removeAll() {
    this.listeners.clear();
  }

  /**
   * classes that host the event should execute this method to call the listeners to action.
   * @param data contains arbitrary data that the host wants to pass to the listener.
   * `data` can also be a reference to a function that returns the data. Use a function
   * when there is a performance cost to obtaining the data. That way, the cost will only be
   * incurred if there are actually listeners listening.
   * @param defaultResult what the result will be if the listeners don't assign one before returning.
   */
  public async cue():Promise<R | undefined | void>;
  public async cue(data:D | (() => D), defaultResult?:R ):Promise<R | undefined | void>;
  public async cue(data:D | (() => D), defaultResult:R ):Promise<R>;
  public async cue(data?:D | (() => D), defaultResult?:R ):Promise<R | undefined | void > {
    if (!this.active || this.listeners.size <= 0)
      return defaultResult;
    if (data instanceof Function)
      data = data();
    let eventParams = new EventParams<D,R>(defaultResult,undefined!);
    for (let [listener, params] of this.listeners) {
      if (params.once)
        this.remove(listener);
      eventParams.listener = listener;
      let result = await listener(data as any, eventParams);
      if (eventParams.isEventCanceled)
        return defaultResult;
      if (typeof result != 'undefined')
        eventParams.result = result;
      if (eventParams.isCueingStopped)
        break;
    }
    return eventParams.result;
  }

}

/**
 * offeres an `onChanged` event that gets cued when a change to the decentant's instance occurs. Use
 * the `create()` static function to instantiate this class.
 * @todo: prevent this class and its decendents from being minified
 */
export class ChangeDetector {
  /**
   * when this is false, on changed and on set events will not be cued.  Use this or one of the
   *
   */
  public shouldCueEvents:boolean = true;

  /**
   *  this must be called to instantiate the class instead of the constructor.
   *
   *  #### technical details
   *
   *  this functon uses some typescript magic in order to make it usable in a simple way. The
   *  `this` parameter in the parameter list lets you declare to typescript what the type of the
   *  `this` value will be.  That way you can call `new this()` and create a new instance of the
   *   this object.  Note that the parameter `this` will not actually be part of the calling
   *  signature of the function which is confusing to say the least. If you are using Intellisense
   *  for this function's expected parameters, the calling signature will be presented to you as:
   *  `ChangeDetector.create()` while the real declaration is
   *  `ChangeDetector.create<T extends typeof ChangeDetector>(this: T)`.  More information about this somewhat
   *  hidden typescript feature is here:
   *  https://www.typescriptlang.org/docs/handbook/2/functions.html#declaring-this-in-a-function
   *
   *  Also, this function takes a generic variable `T` which you aren't expected to specify when
   *  using this function to create an instance of ChangeDetector's descendant. Why don't you need to
   *  specify it? Answer: Typescript has an automatic inference capability that kicks in when you
   *  don't specify a generic type in the call. It normally looks at the types of the passed in
   *  parameters and uses those.  However, in this case, we aren't passing in any real parameters,
   *  but it is able to magically infer the type from `this: T`.  I'm calling this magic because
   *  it seems like circular logic happening here, so Typescript must have special internal code
   *  that sorts this out.
   *  https://www.typescriptlang.org/docs/handbook/2/generics.html#using-class-types-in-generics
   *
   *  the function returns an InstanceType<T>.  Since T is the class of a ChangeDetector descendant,
   *  this allows the function to return an instance of that class.
   *  https://www.typescriptlang.org/docs/handbook/utility-types.html#instancetypetype
   *
   *  This crazy typescript magic is presented, but not fully explained in this very long Github
   *  discussion:
   *  https://github.com/microsoft/TypeScript/issues/5863#issuecomment-528305043
   *
   *  the final piece to the puzzle is that this call `ChangeDetectorDescendant.create()` causes
   *  typescript  to automatically infer the T in the `this: T` parameter based on the class specified on
   *  the call.  Then InstanceType<T> tells typescript that the function will return an instance
   *  of the inferred `this: T` type, which again is `this: ChangeDetectorDescendant`.
   */
  static create<T extends typeof ChangeDetector>(this: T): InstanceType<T> {
    return (new Proxy(new this(),ChangeDetector.proxyHandler)) as InstanceType<T>;
  }
  static proxyHandler = {
    set: (target:ChangeDetector, propertyKey:string, value:any) => {
      let dataHasChanged = ((target as any)[value] != value);
      Reflect.set(target, propertyKey, value);
      // do not call events when native properties of the parent class get set.
      if (['shouldCueEvents'].includes(propertyKey))
        return true;
      if (!target.shouldCueEvents)
        return true;
      target.onSet.cue({propertyKey});
      if (dataHasChanged)
        target.onChanged.cue({propertyKey});
      return true;
    }
  }

  /**
   * this event gets cued whenever a parameter changes.
   * `data.propertyKey:string` contains the name of the changing property.
   * if `propertyKey` is an empty string, it means that multiple properties changed.
   */
  public onChanged = new Event<{propertyKey:string}>();

  /**
   * this event gets cued whenever a parameter is set, even if it's being set to the same value.
   * `data.propertyKey:string` contains the name of the changing property.
   */
  public onSet = new Event<{propertyKey:string}>();

  /**
   * any changes to this class' members will not cue an onChanged event when made inside of the func,
   * but instead a change event will be called at the end.
   */
  public oneEvent(func:()=>void) {
    this.shouldCueEvents = false;
    try {
      func();
    } finally {
      this.shouldCueEvents = true;
      this.onChanged.cue({propertyKey:''});
    }
  }

  public noEvents(func:()=>void) {
    this.shouldCueEvents = false;
    try {
      func();
    } finally {
      this.shouldCueEvents = true;
    }
  }

}

