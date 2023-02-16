/**
  systemSupport contains general functions that can be used on any Javascript platform:
    - web browsers
    - Node.JS
    - Electron
*/

// javascript language support /////////////////////////////////////////////////////

/** thanks to: https://stackoverflow.com/questions/60325323/how-to-test-to-determine-if-browser-supports-js-regex-lookahead-lookbehind */
function supportsRegexLookaround() {
  try {
    return (
      "hibyehihi"
        .replace(new RegExp("(?<=hi)hi", "g"), "hello")
        .replace(new RegExp("hi(?!bye)", "g"), "hey") === "hibyeheyhello"
    );
  } catch (error) {
    return false;
  }
}

export const supports = {
  regexLookaround: supportsRegexLookaround()
}


// files and paths /////////////////////////////////////////////////////////////////
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




// math ////////////////////////////////////////////////////////////////////////////////
export function frac(num:number) {
  return num % 1;
}

/**
 * does a left shift and makes sure to return an unsigned int 32 number.
 * (by default the javascript << operator returns *signed* int32 numbers)
 */
export function uInt32ShiftLeft(uint32:number, shiftCount:number):number {
  return (((uint32 >>> 0) << shiftCount) >>> 0);
}


export function getDecimalSeparator(locale?:string) {
  const numberWithDecimalSeparator = 1.1;
  let parts = Intl.NumberFormat(locale).formatToParts(numberWithDecimalSeparator);
  return parts.find(part => part.type === 'decimal')?.value ?? '.';
}

export function getThousandsSeparator(locale = '') {
  const numberWithThousandsSeparator = 1000;
  let parts = Intl.NumberFormat(locale).formatToParts(numberWithThousandsSeparator);
  return parts.find(part => part.type === 'group')?.value ?? ',';
}


/**
 * returns a javascript number in a special unsigned 32 bit mode.
 *
 * Ex: normally, in javascript this:
 *   - `0b1111_1111_1111_1111_1111_1111_1111_1111 << 1` returns `-2`
 *
 * (which is really: `0b1111_1111_1111_1111_1111_1111_1111_1110`, but expressed as a two's compliment negative number.)
 *
 * but:
 *   - numberAsUInt32(0b1111_1111_1111_1111_1111_1111_1111_1111 << 1) returns `4294967294`
 *
 * (which is also really: `0b1111_1111_1111_1111_1111_1111_1111_1110`, but now it will be expressed as an unsigned 32 bit positive number.)
 */
export function numberToUInt32(n:number) {
  return n >>> 0; // <-- trick to create an unsigned 32bit integer number
}

/**
 * returns a 64 bit bigint where the bits greater than 64 are clipped.
 *
 * Ex: normally, in javascript this:
 *   - `((2n ** 64n) - 1n) << 1n` returns `36,893,488,147,419,103,230n`
 *
 * (which is really: the 65 bit bigint: `11111111111111111111111111111111111111111111111111111111111111110`)
 *
 * but:
 *   - bigIntToUInt64(((2n ** 64n) - 1n) << 1n) returns `18,446,744,073,709,551,614n`
 *
 * (which is really: the 64 bit bigint: `1111111111111111111111111111111111111111111111111111111111111110`)
 */
export function bigIntToUInt64(n:bigint) {
  return BigInt.asUintN(64, n); // <-- creates an unsigned 64bit bigint
}


/**
 * returns a 128 bit bigint where the bits greater than 128 are clipped.
 * see `@link bigIntToUInt64`() for an example.
 */
export function bigIntToUInt128(n:bigint) {
  return BigInt.asUintN(128, n); // <-- creates an unsigned 128bit bigint
}

/**
 * holds a 32 bit unsigned integer value
 */
export class UInt32 {
  private _value: number = 0;

  constructor(value:number) {
    this.value = value;
  }

  /**
   * guaranteed to be an unsigned 32 bit integer
   */
  public get value(): number {
    return this._value;
  }
  public set value(value: number) {
    this._value = numberToUInt32(value);
  }
  public get asBinaryString() {
    return this._value.toString(2).padStart(32,'0');
  }
  public shiftRight(count:number):this {
    return new (this.constructor as any)(this.value >>> count);
  };
  public shiftLeft(count:number) {
    return new (this.constructor as any)(this.value << count);
  };
  public isGreaterThan(uInt32:this) {
    return this.value > uInt32.value;
  };
  public isGreaterThanOrEqualTo(uInt32:this) {
    return this.value >= uInt32.value;
  };
  public isLessThan(uInt32:this) {
    return this.value < uInt32.value;
  };
  public isLessThanOrEqualTo(uInt32:this) {
    return this.value <= uInt32.value;
  };
  public equals(uInt32:this) {
    return this.value == uInt32.value;
  };
}


/**
 * holds a 128 bit unsigned bigint
 */
export class UInt128 {
  private _value: bigint = 0n;

  constructor(value:bigint|number) {
    this.value = BigInt(value);
  }

  /**
   * guaranteed to be an unsigned 128 bit bigint
   */
  public get value(): bigint {
    return this._value;
  }
  public set value(value: bigint) {
    this._value = bigIntToUInt128(value);
  }
  public get asBinaryString() {
    return this._value.toString(2).padStart(128,'0');
  }
  public shiftRight(count:number):this {
    return new (this.constructor as any)(this.value >> BigInt(count));
  };
  public shiftLeft(count:number) {
    return new (this.constructor as any)(this.value << BigInt(count));
  };
  public isGreaterThan(uInt64:this) {
    return this.value > uInt64.value;
  };
  public isGreaterThanOrEqualTo(uInt64:this) {
    return this.value >= uInt64.value;
  };
  public isLessThan(uInt64:this) {
    return this.value < uInt64.value;
  };
  public isLessThanOrEqualTo(uInt64:this) {
    return this.value <= uInt64.value;
  };
  public equals(uInt64:this) {
    return this.value == uInt64.value;
  };
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


/**
 * (inclusive)
 */
export function isBetween(x:number, low:number, high:number):boolean {
  return x >= low && x <= high;
}

export function decimalCount(value:number) {
  if (Math.floor(value) !== value)
    return value.toString().split(".")[1].length || 0;
  return 0;
}

/**
 * wraps a number within a range of numbers.  If `n` is greater than the range, it will wrap back to
 * the start, and if it less, it will wrap back to the end. Multiple wraps can occur if the `n` is
 * greater or less then the range by an amount larger than the range's width.
 * ex.
 *   wrapNumber(11, 1, 10); // returns 1
 *   wrapNumber(15, 1, 10); // returns 5
 *   wrapNumber(7, 0, 6);   // returns 0
 *   wrapNumber(-2, 0, 6);  // returns 5
 *   wrapNumber(12, 1, 5);  // returns 2, because 6=1, 10=5, 11=1, 12=2,
 */
export function wrapNumber(n:number, start:number, end:number) {
  if (start > end)
    throw Error('start must be <= end');
  let rangeWidth = (end - start)+1;
  if (n < start) {
    let magnitude = Math.abs(start - n);
    let afterMultipleWraps = magnitude % rangeWidth;
    return (end - (afterMultipleWraps-1));
  } else if (n > end) {
    let magnitude = Math.abs(n - end);
    let afterMultipleWraps = magnitude % rangeWidth;
    return (start + (afterMultipleWraps-1));
  }
  return n;
}

export function times10ToThe(num:bigint, power:number):bigint {
  if (power == 0)
    return num
  else if (power < 0)
    return num / 10n**BigInt(-power);
  return num * 10n**BigInt(power);
}

export function numberOrUndefined(num:number|string|undefined|null):number|undefined {
  if (isBlank(num))
    return;
  if (typeof num != 'number')
    num = Number(num);
  return (isNormalNumber(num) ? num : undefined);
}

export function stringOrUndefined(num:number|string|undefined|null):string|undefined {
  if (typeof num == 'undefined')
    return;
  return String(num);
}

export function countDigits(n:number) {
  return String(n).length;
}

/**
 * indicates if the bit in the bit position is set.
 * example positions:
 * ```
 * isBitSet(35, 6) // true
 *
 * // in this example, bit 6 is set in the number 35:
 * // 35 = 0b00100011
 * //        87654321
 *
 * ```
 */
export function isBitSet(num:number, bitPosition:number) {
  return (num & (1 << bitPosition-1)) > 0;
}

export function round(n:number,decimalPlaces:number):number {
  return Math.round(n*(decimalPlaces*10))/(decimalPlaces*10);
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
 * concatenate strings with with separators
 */
//export function separate(separator:string, items:[]):string; // not sure how to set this properly in typescript
export function separate(separator:string, ...items:StringableRest):string {
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

export function isBlank(s:any):boolean {
  if (typeof s == 'undefined' || s == null)
    return true;
  if (typeof s == 'string' && s == '')
    return true;
  return false;
}

export function firstNonBlank( ...items:StringableRest):string {
  let result = '';
  if (typeof items[0] !== 'undefined' && Array.isArray(items[0]))
    items = items[0];

  for (let item of items) {
    if (isBlank(item)) {
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
  return s!;
}

export function prefix(pfx:string,s:string|undefined):string {
  return (isBlank(s) ? '' : pfx + s);
}

export function suffix(s:string|undefined, sfx:string):string {
  return (isBlank(s) ? '' :  s + sfx);
}

export function infix(pfx:string, s:string|undefined, sfx:string):string {
  return (isBlank(s) ? '' : pfx + s + sfx);
}

export function spaces(...items:StringableRest):string {
  return separate(' ',...items);
}

export function commas(...items:StringableRest):string {
  return separate(',',...items);
}

export function commaSpaces(...items:StringableRest):string {
  return separate(', ',...items);
}

export function newLines(...items:StringableRest):string {
  return separate('\n',...items);
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

export function endWithNewline(s: string): string {
  // let match = s.match(/\n$'/);
  // if (match && typeof match.index == 'number')
  //   return s.substring(0,match.index+1);
  // return s+'\n';
  return s.trimEnd()+'\n';
}


/**
 * pads a string to the number of unicode characters specified.  Unicode strings with multiple byte characters (like emojis) will
 * confound javascripts built in `String.padStart()`.
 */
export function unicodePadStart(s:string, length:number, padCharacter:string = ' ') {
  let uLen = unicodeLength(s);
  if (uLen >= length)
    return s.substring(0, length);
  return padCharacter.repeat(length - uLen) + s;
}

/**
 * pads a string to the number of unicode characters specified.  Unicode strings with multiple byte characters (like emojis) will
 * confound javascripts built in `String.padEnd()`.
 */
export function unicodePadEnd(s:string, length:number, padCharacter:string = ' ') {
  let uLen = unicodeLength(s);
  if (uLen >= length)
    return unicodeSubstring(s, 0, length);
  return s + padCharacter.repeat(length - uLen);
}


/**
 * returns the substring taking into unicode multiple byte characters into consideration
 * @param start starting character position
 * @param end the position of the last character returned (** not including that character!).  This
 * assumes the rest of the string if not specified.
 */
export function unicodeSubstring(s:string, start:number, end?: number) {
  let sArray = [...s];
  end = end ?? sArray.length;
  return sArray.filter((value, i) => (i >= start && i < end! ? value : undefined) ).join('');
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
  let regex = new RegExp('^('+separate('|',chars)+')+','g');
  return s.replace(regex,'');
}

/**
 * trims the specified characters off of the end of a string, optionally until a `minLength` is reached.
 */
export function trimEndChars(s:string, chars:string[], minLength?:number):string {
  if (typeof minLength == 'undefined')
    minLength = 0;
  chars = chars.map( ch => escapeRegex(ch) );
  let regex = new RegExp('('+separate('|',chars)+')+$','g');
  let match = s.match(regex);
  if (match && match[0]) {
    let trimLength = match[0].length;
    let newLength = noLowerThan(minLength, s.length - trimLength)
    return s.substring(0, newLength);
  }
  return s;
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
  let regex = new RegExp('('+separate('|',chars)+')+$','g');
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

export function isWhitespace(s:string):boolean {
  return Boolean(s.match(/\s+/));
}

/**
 * returns the last word in the text string.  It also includes any trailing whitespace in `trailingWhitespace`.
 */
export function getLastWord(s:string) {
  let match = s.match(/([^\s]+)(\s*)$/);
  let result = {lastWord:'', trailingSpace:''};
  if (match) {
    result.lastWord = match[1] ?? '';
    result.trailingSpace = match[2] ?? '';
  }
  return result;
};


export function byteToString(byte:number):string {
  return String.fromCharCode(byte)
}


export function numberToString<T extends string|undefined>(num:number | bigint | undefined, defaultString?:T):T {
  if (typeof num == 'undefined' || (typeof num == 'number' && isNaN(num)) )
    //@ts-ignore: typescript is a pain sometimes
    return defaultString;
  //@ts-ignore: waitng for typescript to have an `is` constraint, not just an `extends`
  return num.toLocaleString('fullwide',{useGrouping:false,maximumFractionDigits:20});
}


/**
 * counts the number of lines that would be visible if the string was pasted into an editor
 * - empty string = 1
 * - a string without any newline = 1
 * - a string with one new line at the end = 2
 */
export function countLines(s:string):number {
  return (s.split(/\r\n|\r|\n/).length);
}

/**
 * @param s the string
 * @param position a 0 based position into the string
 * @returns the line and column numbers of the supplied `position`, taking newlines into consideration.  Both the
 *  `line` and `column` are also considered to be 0 based.
 */
export function positionToLineColumn(s:string, position:number):{line:number, column:number} {
  let beginningText = s.substr(0,position);
  let line = (beginningText.match(/\n/g)?.length ?? 0);
  let column = beginningText.length - beginningText.search(/(\n).*$/) - 1;
  return {line, column};
}

/**
 * example:
 * ```
 * let s =
 * `line 0
 * line 1
 * line 2`;
 * ```
 * s.charAt(lineColumnToPosition(s, 2, 0)) returns 'l'
 *
 * @param s the string
 * @param line a 0 based line number
 * @param column a 0 based column number
 * @returns the 0 based position based on the supplied line and column numbers, taking newlines into consideration.
 */
export function lineColumnToPosition(s:string, line: number, column: number): number {
  let lines = stringToLines(s);
  let result = column;
  for (let i = line-1; i >= 0; i--) {
    result += lines[i].line.length + lines[i].newLine.length;
  }
  return result;
}

export function stringToPrintableString(s:string):string {
  let array = (new TextEncoder()).encode(s);
  return bufferToPrintableString(array);
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

/** @deprecated change to Buffer.toString() */
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
export function stringToLines(s:string):{line:string, newLine:string}[] {
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

export function addLineNumbers(sql: string) {
  let result = '';
  let lines = stringToLines(sql);
  let maxDigits = countDigits(lines.length);
  let i = 1;
  for (let line of lines) {
    result += String(i++).padStart(maxDigits,' ') + '| ' + line.line + line.newLine;
  }
  return result;
}


export function isNormalNumber(n:number):boolean {
  return (typeof n == 'number' && !isNaN(n) || isFinite(n));
}

/**
 * same as parseInt(), except it returns undefined instead of NaN
 */
export function stringToInt(s:string):number|undefined {
  let result = parseInt(s);
  if (!isNormalNumber(result))
    return undefined;
  return result;
}

/**
 * same as parseFloat(), except it returns undefined instead of NaN
 */
export function stringToFloat(s:string):number|undefined {
  let result = parseFloat(s);
  if (!isNormalNumber(result))
    return undefined;
  return result;
}

/**
 * returns an integer number, or raises an exception
 */
export function stringToIntOrFail(s: string, errorItem: string = 'string') {
  let result = stringToInt(s);
  if (typeof result == 'undefined')
    throw new Error(`${errorItem} "${s}" is not an integer`);
  return result;
}

export function unicodeLength(s:string):number {
  return [...s].length;
}

/**
 * indents each line in a multiline string.
 * @param s the multiline string
 * @param indentString the string to use to indent
 */
export function indent(s:string, indentString:string):string;
/**
 * indents each line in a multiline string.
 * @param s the multiline string
 * @param indentStringArray the strings to use to indent--one string for each line. The last entry will be the indent for the remainder of the lines encountered.
 */
export function indent(s:string, indentStringArray:string[]):string;
/**
 * indents each line in a multiline string by the amount specified in the params.
 * @param s the multiline string
 * @param size indicates the number of spaces to indent each line starting from the first line.
 * @param indentCharacter the character used to do the indenting (defaults to space)
 */
export function indent(s:string, size:number, indentCharacter?:string):string;
/**
 * indents each line in a multiline string by the amount specified in the params.
 * @param s the multiline string
 * @param sizeArray indicates the number of spaces to indent each line starting from the first line. The last entry will be the amount of space to indent for the remainder of the lines encountered.
 * @param indentCharacter the character used to do the indenting (defaults to space)
 */
export function indent(s:string, sizeArray:number[], indentCharacter?:string):string;
export function indent(s:string, secondParam:string|string[]|number|number[], indentCharacter:string = ' '):string {
  let sizes:number[] = [];
  let indents:string[] = [];

  let usesSizes = false;
  if (typeof secondParam == 'number') {
    usesSizes = true;
    sizes = [secondParam];
  } else if (Array.isArray(secondParam) && typeof secondParam[0] == 'number') {
    usesSizes = true;
    sizes = secondParam as number[];
  } else if (typeof secondParam == 'string') {
    indents = [secondParam];
  } else
    indents = secondParam as string[];

  let arrayLength = indents.length;
  if (usesSizes)
    arrayLength = sizes.length;

  let lines = stringToLines(s);
  let result = '';
  let indentIndex = 0;
  for (let item of lines) {
    let indentString = '';
    if (usesSizes)
      indentString = indentCharacter.repeat(sizes[indentIndex]);
    else
      indentString = indents[indentIndex];
    result += prefix(indentString, item.line) + item.newLine;
    if (indentIndex < arrayLength-1)
      indentIndex++;
  }
  return result;
}

/**
 * this implements the standard functionality for template tags.  This is used when browsers can't
 * handle the code in the L() function.
 */
function defaultTemplateTag(templateStrings:TemplateStringsArray,...params:(string|number)[]):string {
  let result = '';
  let i = 0;
  for (let s of templateStrings)
    result += s + (params[i++] ?? '');
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
 * };
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
 * #### pipe character
 * you may also use the pipe character "|" to identify the end of the indent space like so:
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
 * #### pipe barrrier
 * you may also use multiple pipes to create a visual barrier between the code's indent space, and your string's indent space:
 * ```
 * function getString() {
 *   return L`
 *     |    this is the bottom half
 *     |    of a nested html block.
 *     |  </p>
 *     |</div>
 *   `;
 * }
 * ```
 * #### automatic indents
 * by the way, a pipe doesn't have to be used in this case, because the last `</div>` will serve as the indent marker. This returns the same string as the above example that has a pipe for each line.
 * ```
 * function getString() {
 *   return L`
 *         this is the bottom half
 *         of a nested html block.
 *       </p>
 *     </div>
 *   `;
 * }
 * ```
 * #### other pipes
 * pipes found in the text in other areas will just be normal pipes.  There's no need to escape them in any way. For example:
 * ```
 * function getString() {
 *   return L`
 *     |  if (a == 1 || b == 2)
 *     |    c = 3;
 *   `;
 * }
 * ```
 * this uses the inital pipes to establish the indent space, and the `or` operator in the if statement is left alone
 *
 *
 * #### multiline variables
 * even multiline variables in the template will be indented properly, for example:
 * ```
 * function getString() {
 *   let snippet = L`
 *     <p>
 *       this is indented even further
 *     </p>
 *   `;
 *   return L`
 *     <div>
 *       ${snippet}
 *     </div>
 *   `;
 * }
 * ```
 * this will return
 * ```
 * '<div>\n  <p>\n    this is indented even further\n  </p>\n</div>\n'`
 * ```
 *
 */
export function L(templateStrings:TemplateStringsArray,...params:(string|number)[]):string {
  if (!supports.regexLookaround)
    return defaultTemplateTag(templateStrings,...params);

  let joinedTemplate = templateStrings.join('\0');  // <-- starts us off with something like '\n   this \0 is\n   a template'

  // break the string into lines, and grab the indents for each line
  let lineMatches = Array.from( joinedTemplate.matchAll(/(\r\n|\n)(\s*)(\S)/g) ); // <-- matches <newline sequence><spaces><first non space char>
  let removeSpaces = Number.MAX_SAFE_INTEGER;
  for (let match of lineMatches) {
    let spaces = trimStartChars(match[2] ?? '',['\n','\r']);
    removeSpaces = Math.min(spaces.length,removeSpaces);
  }

  // remove the leading newline
  if (lineMatches[0] && typeof lineMatches[0][1] == 'string') {
    lineMatches[0][1] = '';
  }

  // remove spaces
  let p = lineMatches[0]?.index ?? 0;   // <-- starts off at the index of the first match therefore skipping any characters on the first line, which is supposed to be empty
  let linedUpString = '';
  for (let lineMatch of lineMatches) {
    let newLine = lineMatch[1];
    let indent = lineMatch[2];
    let firstNonSpace = lineMatch[3];
    linedUpString +=
      joinedTemplate.substring(p,lineMatch.index) +  // <-- the text from the prior line
      newLine;                                       // <-- the newline character(s) from the prior line
    if (firstNonSpace == '|') { // <-- if is a pipe
      if (removeSpaces == indent.length)  // and the pipe is an indent marker
        linedUpString += indent.substr(0, indent.length - removeSpaces);  // <-- trims down the space starting from the end of indent
      else   // <-- and the pipe is not an indent marker
        linedUpString += indent.substr(0, indent.length - (removeSpaces+1)) + '|';  // add an extra space for removal because a space is technically the indent marker now
    } else // <-- a normal line with no pipe involved
      linedUpString += indent.substr(0, indent.length - removeSpaces) + firstNonSpace; // <-- trims down the space starting from the end of indent
    p = lineMatch.index! + lineMatch[0].length;                     // <-- moves p to the point after the match
  }

  // at this point p is sitting on the first character after the last <newline><spaces><non-space> character.
  // the only possible remaining pattern is <non-spaces>[newline][spaces].  So, we will always grab the
  // text from p to the newline or the end of the string if there is no newline.  Then we have to decide
  // if the spaces after the newline should be trimmed and kept, or all thrown away
  let remaining = joinedTemplate.substr(p);
  let newLineMatch = remaining.match(/(\r\n|\n)/);  // why? \\r\\n|\\n
  if (newLineMatch && (newLineMatch.index != null)) {
    linedUpString += remaining.substring(0,newLineMatch.index + newLineMatch[0].length);
    remaining = remaining.substr(newLineMatch.index + newLineMatch[0].length); // <-- get everything after the newline, which should be spaces
    remaining = remaining.substr(0, remaining.length - removeSpaces) // <-- trim down the spaces
  }
  linedUpString += remaining

  // replace params - we can't simply use unescapeslashes() and replace the nulls because the template string may contain them
  let result = '';
  let i = 0;
  p = 0;
  // note: as of 4/2022 safari crashes parsing regex with lookarounds
  for (let match of linedUpString.matchAll(new RegExp('(?<!\\\\)\\0','g') )) {  // <-- finds all nulls which show where the params go
    let preText = linedUpString.substring(p, match.index); // <-- gets the lined up string before the null
    let param = String(params[i++] ?? '') ; // gets the param's text
    let preTextIndent;
    if (p == 0)
      preTextIndent = (preText.match(new RegExp('(?=\\n|^)[\\t\\f\\v ]+$','m')) ?? [''])[0]; // if it's the first call, this gets trailing whitespace after a newline or start of string
    else
      preTextIndent = (preText.match(new RegExp('(?<=\\n)[\\t\\f\\v ]+$','m')) ?? [''])[0]; // else, just gets trailing whitespace after a newline
    if (preTextIndent) {
      param = indent(param, ['',preTextIndent]); // indent the param so it matches the template
      let postText = linedUpString.substring(match.index!+1); // the text after the null
      if (postText.match(/^[\t\f\v ]*\n/)) // if starts with optional whitespaces and then a newline
        if (param.endsWith('\n')) // and the param ends with a newline
          param = param.substring(0,param.length-1); // then remove the param's newline because we don't need it
    }
    result += preText + param; // add the param
    p = match.index! + 1;
  }
  //result += unescapeSlashes(linedUpString.substr(p));  // <-- remaining text at the end of the string
  result += linedUpString.substr(p);  // <-- remaining text at the end of the string

  return result;
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


export function buildTextGrid(grid: string[][], options?: { cellSeparator?: string, rowPrefix?: string, rowSuffix?: string; columnOptions?:any[] }): string {
  let cellSeparator = options?.cellSeparator ?? '  ';
  let rowPrefix = options?.rowPrefix ?? '';
  let rowSuffix = options?.rowSuffix ?? '\n';
  let columnOptions = options?.columnOptions;
  let result = '';
  if (grid.length == 0)
    return '';
  let columnWidths:number[] = (new Array(grid[0].length)).fill(0);
  // first pass, determine max column widths
  for (let row of grid)
    for (let i=0; i < row.length; i++)
      if (row[i].length > columnWidths[i])
        columnWidths[i] = unicodeLength(row[i]);
  // second pass, create the actual grid
  for (let row of grid) {
    result += rowPrefix;
    let isFirst = true;
    for (let i=0; i < row.length; i++) {
      result += (isFirst ? '' : cellSeparator);
      if (columnOptions && columnOptions[i]?.textAlign && columnOptions[i].textAlign == 'right')
        result += unicodePadStart(row[i], columnWidths[i], ' ');
      else
        result += unicodePadEnd(row[i], columnWidths[i], ' ');

      isFirst = false;
    }
    result += rowSuffix;
  }
  return result;
}

export function removeChars(s:string, removeFunc:(ch:string) => boolean):string {
  let result = '';
  for (let ch of s)
    if (!removeFunc(ch))
      result += ch;
  return result;
}

/**
* replaces all CRLFs with LFs
*/
export function internalizeLineEndings(s:string):string {
  return s.replace(/\r\n/g, '\n');
}

export function parseFloatLocale(numericString:string, locale?:string) {
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
 * (s)ingular (p)lural - returns the number concatenated with the `singular` param if the number == 1 or else, it returns `plural`.
 * See `spHide()` to do the same thing without including the number.
 * @param num can be a number or a formatted floating point string of any non-scientific format, like: $400.45 or -200 or
 * (3,056.792). When sending a formatted string, the `locale` parameter is used to interpret the number.
 * @param singluar the string that gets concatenated to the number 1
 * @param plural the string that gets concatenated to numbers not equal to 1
 * @param locale used to interpret the `num` parameter if it's a formatted string, mainly to figure out the commas and
 * periods.  Leave blank to use the system's default locale.
 */
export function sp(num:number | string, singluar:string, plural:string, locale?:string):string {
  let parsedNum:number;
  if (typeof num == 'number')
    parsedNum = num
  else
    parsedNum = parseFloatLocale(num, locale);
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

/**
 * returns a value properly escaped and delimited where needed
 */
export function formatCsvValue(value:string) {
  if (value.includes('"'))
    return '"' + replaceAll(value,'"','""') + '"';
  else if (value.match(/[\n\r\,]/))
    return '"'+value+'"';
  return value;
}

// functions ////////////////////////////////////////////////////////////////
export function def(param:any,defaultValue:any) {
  if (param == null)
    return defaultValue;
  else
    return param;
}

/**
 * pauses execution for the supplied milliseconds.  This uses javascript's `setTimeout()` internally.
 */
export async function sleep(ms:number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * allows javascript to complete the `poll` phase of its event loop, which handles all pending I/O
 * events and callbacks. This uses `setImmediate()` internally.
 * See https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick/
 */
export async function processIOEvents():Promise<void> {
  await new Promise(resolve => setImmediate(resolve));
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
export function transform<ItemType,ResultType>(iterable:Iterable<ItemType>, callback:(item:ItemType, index?: number)  => ResultType|void ): ResultType[] {
  let result:ResultType[] = [];
  let index:number = 0;
  for (let oldItem of iterable) {
    let newItem = callback(oldItem, index++);
    if ( typeof newItem != 'undefined' && newItem != null )
      result.push(newItem);
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

/**
  keeps the `value` between the `min` and `max` values.
*/
export function minMax(value: number, min: number, max: number): number {
  if (value < min)
    return min;
  else if (value > max)
    return max;
  return value;
}

export function rawTextDateToLocalMidnight(rawTextDate: string):Date {
  if (!rawTextDate.match(/^\d\d\d\d-[01]\d-[0-3]\d$/) )
    throw new Error('rawTextDateToLocalMidnight(): rawTextDate must be in the form YYYY-MM-DD');
  return new Date(rawTextDate+'T00:00:00.000');
}

export function ifBadNumber(testNumber: number, defaultNumber: number): number {
  return (isNormalNumber(testNumber) ? testNumber : defaultNumber);
}

export function normalNumberOrUndefined(testNumber: number): number|undefined {
  if (isNormalNumber(testNumber))
    return testNumber;
  return undefined;
}

export function noHigherThan(testNumber: number, maxNumber: number): number {
  return Math.min(testNumber,maxNumber);
}

export function noLowerThan(testNumber: number, minNumber: number): number {
  return Math.max(testNumber,minNumber);
}

export function fitRange(testNumber: number, minNumber: number, maxNumber: number): number {
  return noLowerThan(noHigherThan(testNumber,maxNumber),minNumber);
}

export function getLines(multiLineString: string) {
  return multiLineString.replace(/\r\n/g,'\n').split('\n');
}

/**
 * gets the value of a `name=value` pair
 */
export function getValue(s: string, separator:string = '='): string {
  let p = s.indexOf(separator);
  return s.substring(p+separator.length);
}

/**
 * gets the name of a `name=value` pair
 */
export function getName(s: string, separator:string = '='): string {
  let p = s.indexOf(separator);
  return s.substring(0,p);
}

/**
 * logs the value to the console as it was during the call.  If you use just plain
 * console.log(), the value will be the current value of the object at the time you
 * look at it in the browser's debugging tools.
 */
export function debug(value:any) {
  console.log(JSON.parse(JSON.stringify(value)));
}

/**
 * logs the value to the console in a JSON format. (In case you are unable to expand object values in your terminal)
 */
export function debugText(value:any) {
  console.log(JSON.stringify(value,undefined,2));
}

export function deepClone(object: any):any {
  return JSON.parse(JSON.stringify(object));
}

export type AnyObject = {[key: string]:any};

/**
 * copies all properties from `srcObject` to `destObject`, skipping any properties named in `options.except[]`.
 *
 * if the property is named in `options.clone[]` and it has a getClone() method, it will be called, and the result
 * will be placed into the destination instead of simply copying the reference.
 */
export function copyProperties(srcObject:AnyObject, destObject:AnyObject, options?:{except?:string[], clone?:string[]}) {
  for (let property in srcObject) {
    let propType = typeof srcObject[property];
    if (propType == 'function')
      continue;
    if (options?.except?.includes(property))
      continue;
    if (options?.clone?.includes(property)) {
      if (
        typeof srcObject[property] == 'object' &&
        srcObject[property] != null
      ) {
        if ('getClone' in srcObject[property])
          destObject[property] = srcObject[property].getClone();
        else {
          let newProp = {};
          copyProperties(srcObject[property], newProp);
          destObject[property] = newProp;
        }
        continue;
      }
      throw new Error(`property "${property}" does not have a getClone() method`);
    }
    destObject[property] = srcObject[property];
  }
}


/**
 * default options:
 *   - `displayZeroUnit` = `false`
 *   - `billionIsG` = `true`
 */
export function getDisplayNumber(value: number, suffix:string='', options?:{displayZeroUnit?:boolean, billionIsG?:boolean, locale?:string}) {
  let {displayZeroUnit = false, billionIsG = true, locale} = options ?? {};

  if (value < 1000) {
    let n = value;
    return n + (!displayZeroUnit && n == 0 ? '' : prefix(' ',suffix));

  } else if (value <= 5000) {
    // in the low thousands, add a 'k' with one decimal place
    let n = value/1000;
    return n.toLocaleString(locale, { maximumFractionDigits: 1 }) + ' k'+suffix;

  } else if (value <= 1_000_000) {
    // under a million, same as above, but drop fractions
    let n = value/1000;
    return n.toLocaleString(locale, { maximumFractionDigits: 0 }) + ' k'+suffix;

  } else if (value <= 5_000_000) {
    // in the low millions, add an 'M' with one decimal place
    let n = value/1_000_000
    return n.toLocaleString(locale, { maximumFractionDigits: 1 }) + ' M'+suffix;

  } else if (value <= 1_000_000_000) {
    // under a billion, same as above, but drop fractions
    let n = value/1_000_000;
    return n.toLocaleString(locale, { maximumFractionDigits: 0 }) + ' M'+suffix;

  } else if (value <= 1_000_000_000_000) {
    // under a trillion, add a 'B' or 'G' with two decimal places
    let n = value/1_000_000_000;
    return n.toLocaleString(locale, { maximumFractionDigits: 2 }) + ' '+(billionIsG ? 'G' : 'B')+suffix;
  }

  // else, add a 'T' with two decimal places
  let n = value/1_000_000_000_000;
  return n.toLocaleString(locale, { maximumFractionDigits: 2 }) + ' T'+suffix;
}

export function getDisplayByteSize(value: number, options?:{displayZeroUnit?:boolean, locale?:string}) {
  let {displayZeroUnit = false, locale} = options ?? {};
  return getDisplayNumber(value, 'b', {billionIsG: true, displayZeroUnit, locale});
}


/**
 * case insensitive locale sort
 */
export function sortStrings<T>(selectItems: T[], getValues:  (a: T, b: T) => {a:string, b:string}  =  (a,b)=>({a:String(a),b:String(b)})  ) {
  let collator = new Intl.Collator(undefined, {sensitivity: 'accent'});
  selectItems.sort((aSource,bSource) => {
    let {a, b} = getValues(aSource,bSource);
    return collator.compare(a, b);
  });
}

export function parseIntDef(s:string, def:number|undefined = undefined): number|undefined {
  let result = parseInt(s);
  if (isNaN(result) || !Number.isSafeInteger(result))
    return def;
  return result;
}

// network //////////////////////////////////////////////////

export function ipV4ToUInt32(ipV4:string) {
  let bytes = ipV4.split('.').map((s) => new UInt32(stringToInt(s) ?? 0) );
  return new UInt32(
    bytes[3].value +
    bytes[2].shiftLeft(8).value +
    bytes[1].shiftLeft(16).value +
    bytes[0].shiftLeft(24).value
  );
};

export function ipV6ToUInt128(ipV6:string):UInt128 {
  let sWords = ipV6.split(':');
  let highWords:UInt128[] = [];
  let lowWords:UInt128[] = [];
  let currentWords:UInt128[] = highWords;
  let words:UInt128[] = [];
  for (let i = 0; i < sWords.length; i++) {
    if (sWords[i] == '')
      currentWords = lowWords;
    else
      currentWords.push( new UInt128( ifBadNumber(Number('0x'+sWords[i]), 0) ) );
  }
  for (let highWord of highWords)
    words.push(highWord);
  for (let i=0; i < 8 - (lowWords.length + highWords.length); i++)
    words.push( new UInt128(0));
  for (let lowWord of lowWords)
    words.push(lowWord);

  return new UInt128(
    words[7].value +
    words[6].shiftLeft(16).value +
    words[5].shiftLeft(32).value +
    words[4].shiftLeft(48).value +
    words[3].shiftLeft(64).value +
    words[2].shiftLeft(80).value +
    words[1].shiftLeft(96).value +
    words[0].shiftLeft(112).value
  );
};

export function parseIpV4Cidr(ipV4Cidr:string):{uInt32:UInt32, cidrBits:number} {
  let split = ipV4Cidr.split('/');
  return {
    uInt32: ipV4ToUInt32(split[0]),
    cidrBits: parseInt(split[1])
  }
}

export function parseIpV6Cidr(ipV6Cidr:string):{uInt128:UInt128, cidrBits:number} {
  let split = ipV6Cidr.split('/');
  return {
    uInt128: ipV6ToUInt128(split[0]),
    cidrBits: parseInt(split[1])
  }
}

export function isIpV4(ip:string) {
  return ip.includes('.');
}

export function normalizeIpV4(ip:string) {
  if (ip.startsWith('::ffff:'))
    return ip.substring(7);
  return ip;
}

/**
 * returns 0 if the `ipV4` is withinn the `Cidr` range, < if the `ipV4` exists in a range less than the `Cidr`, or > 0 if the `ipV4` exists in a range greater than the `Cidr`.
 */
export function ipV4CidrCompare(ipV4:string, ipV4Cidr:string) {
  let ipV4UInt32 = ipV4ToUInt32(ipV4);
  let parsedCidr = parseIpV4Cidr(ipV4Cidr);
  let bitMask = (new UInt32(0xFFFFFFFF)).shiftLeft(32 - parsedCidr.cidrBits);
  let ipV4UInt32Masked = new UInt32(ipV4UInt32.value & bitMask.value);
  // console.log('       ipV4Uint32:'+ipV4UInt32.asBinaryString);
  // console.log('          bitMask:'+bitMask.asBinaryString);
  // console.log(' ipV4Uint32Masked:'+ipV4UInt32Masked.asBinaryString);
  // console.log('parsedCidr.uInt32:'+parsedCidr.uInt32.asBinaryString);
  return ipV4UInt32Masked.value - parsedCidr.uInt32.value;
}


/**
 * returns 0 if the `ipV6` is withinn the `Cidr` range, < if the `ipV6` exists in a range less than the `Cidr`, or > 0 if the `ipV6` exists in a range greater than the `Cidr`.
 */
export function ipV6CidrCompare(ipV6:string, ipV6Cidr:string):number {
  let ipV6UInt128 = ipV6ToUInt128(ipV6);
  let parsedCidr = parseIpV6Cidr(ipV6Cidr);
  let bitMask = (new UInt128(0xFFFFFFFF_FFFFFFFF_FFFFFFFF_FFFFFFFFn)).shiftLeft(128 - parsedCidr.cidrBits);
  let ipV6UInt128Masked = new UInt128(ipV6UInt128.value & bitMask.value);
  let result = (ipV6UInt128Masked.value - parsedCidr.uInt128.value);
  // console.log(`${ipV6} (${result})--> ${ipV6Cidr}`);
  // console.log('              ipV6: '+ipV6);
  // console.log('       ipV6UInt128:'+ipV6UInt128.asBinaryString);
  // console.log('           bitMask:'+bitMask.asBinaryString);
  // console.log(' ipV6UInt128Masked:'+ipV6UInt128Masked.asBinaryString);
  // console.log('parsedCidr.uInt128:'+parsedCidr.uInt128.asBinaryString);
  // console.log('');
  if (result == 0n)
    return 0;
  if (result > 0n)
    return 1;
  return -1;
}

export interface ArrayLikeProxyParams<TargetType extends object, ItemType> {
  target: TargetType,
  getLength?: () => number,
  getItem: (index:number) => ItemType | undefined
}

export class ArrayLikeProxy<TargetType extends object,ItemType> implements ArrayLike<ItemType> {
  readonly [n: number]: ItemType;

  constructor(
    private params: ArrayLikeProxyParams<TargetType, ItemType>
  ) {
    return new Proxy(
      params.target,
      {
        get: (target, prop, receiver) => {
          let index = Number(prop);
          if (!isNaN(index) && !(prop in target))
            return params.getItem(index);
          return Reflect.get(target, prop, receiver);
        }
      }
    ) as ArrayLikeProxy<TargetType,ItemType>;
  }

  public get length(): number {
    if (this.params.getLength)
      return this.params.getLength();
    return (this.params.target as any).length;
  }

}

/**
 * sets the property to a new value if the current value is different. If it actually sets the property,
 * the onChanged event is called with the old value.
 */
export function setProp(obj: object, propName:string, value:any, onChanged?:(oldValue:any) => void) {
  if ((obj as any)[propName] === value)
    return;
  let oldValue = (obj as any)[propName];
  (obj as any)[propName] = value;
  if (onChanged)
    onChanged(oldValue);
}


export function base64ToBase64Url(s:string):string {
  return trimEndChars(s.replace(/\+/g, '-').replace(/\//g, '_'), ['=']);
}

export function base64UrlToBase64(s:string):string {
  return trimEndChars(s.replace(/-/g, '+').replace(/_/g, '/'), ['=']);
}

export function stringTobase64Url(s:string):string {
  return base64ToBase64Url( btoa(unescape(encodeURIComponent(s))) );
}

export function base64UrlToString(s:string):string {
  return decodeURIComponent(escape( base64UrlToBase64(atob(s)) ));
}


export function objectsHaveSameKeys(...objects:any[]) {
  let union = new Set<any>();
  union = objects.reduce((keys, object) => keys.add(Object.keys(object)), union);
  if (union.size == 0)
    return true;
  if (!objects.every((object) => union.size === Object.keys(object).length))
    return false;
  for (let key of union.keys()) {
    let res = objects.map((o) => (typeof o[key] === 'object' ? o[key] : {}))
    if (!objectsHaveSameKeys(...res)) return false
  }
  return true
}




// date - simple date functions //////////////////////////////////////////////////////////////////////


/**
 * number of seconds since since 1970-01-01 0:00.000 UTC
 */
export function unixTimeSeconds(date:Date = new Date()) {
  return Math.floor(date.getTime() / 1000);
}

/**
 * number of milliseconds since 1970-01-01 0:00.000 UTC
 */
export function unixTimeMsec(date:Date = new Date()) {
  return Math.floor(date.getTime());
}

export function unixTimeSecondsToDate(seconds:number):Date {
  return new Date(seconds * 1000);
}

export function isDateInRange(date: Date, start: Date, end: Date): boolean {
  let dateUnixMSec = unixTimeMsec(date);
  return dateUnixMSec >= unixTimeMsec(start) && dateUnixMSec <= unixTimeMsec(end);
}

export function secondsBetween(start: Date, end: Date): number {
  return unixTimeSeconds(start) - unixTimeSeconds(end);
}

export function secondsSince(date: Date): number {
  return secondsBetween(new Date(), date);
}

/**
 * makes sure start comes before end
 */
export function startBeforeEnd(start: number, end: number): { start: number; end: number} {
  if (end < start)
    [start, end] = [end, start];
  return {start, end};
}
