import * as ss from './common/systemSupport';
import { TK, Scanable, splitTrivia } from './token';
import { docs } from './document';
import * as vs from './common/vscodeSupport';
import * as as from './appSupport';
import { Module } from './moduleParser';
import { SourceModule } from './projectModule';

/**
 *```
 * | kind          | example                                   |
 * | ------------- | ----------------------------------------- |
 * | moduleOnly    | import './myModule';                      |
 * | defaultAlias  | import mm from './myModule';              |
 * |               | import mm, { symbol1 } from './myModule'; |
 * | allAlias      | import * as mm from './myModule';         |
 * | symbolsOnly   | import { symbol1 } from './myModule';     |
 *```
 */
export enum ImportKind {moduleOnly, defaultAlias, allAlias, symbolsOnly}


export class ImportSymbol extends Scanable {
	public name:string = '';
	public alias:string = '';
	public nameTrivia: string = '';

	public get nameAndAlias(): string {
	  return this.name + ss.prefix(' as ',this.alias);
	}

	public assign(symbol: ImportSymbol) {
		this.name = symbol.name;
		this.alias = symbol.alias;
		this.nameTrivia = symbol.nameTrivia;
	}

  public scan() {
		this.nameTrivia = this.token.trivia;
		this.name = this.token.text;
		if (this.token.nextIs(TK.AsKeyword)) {
			this.token.getNext();
			if (this.token.kind == TK.Identifier || this.token.isAKeyword) {
				this.alias = this.token.text;
				this.token.getNext();
				return true;
			}
			return false;
		}
	  return true;
	}
}

class ImportSymbols extends Scanable {
  public items:Array<ImportSymbol> = [];
  public isFound = false;
 	public foundSymbol:ImportSymbol | null = null;
	public appendWarning: string = '';
	public endTrivia: string = '';
  public cursorPosAfterAsText:number = 0;
	public commasHaveSpaces: boolean = false;

	public get indentTrivia():string {
		if (this.items.length == 0)
		  return '';
		let [topTrivia,bottomTrivia] = splitTrivia(this.items[0].nameTrivia);
		return bottomTrivia;
	}

  public add(name:string, alias:string) {
	  let symbol = new ImportSymbol();
		symbol.name = name;
		symbol.alias = alias;
	  this.items.push(symbol);
		(this.parent as ImportStatement).hasSymbols = true;
	}

  /**
	 * import symbols are similar to object destructuring statement, possibilites are:
	 *```
	 * {}
	 * { item }
	 * { item1 as ItemA }
	 * { item1 as ItemA, Item2 }
	 * { item1 as ItemA, Item2 }
	 *```
	 */
  public scan() {
		if (!this.token)
		  throw Error('token must be passed to the constructor');
		while (true) {
			this.token.getNext();
			if (this.token.is(TK.Identifier) ) {
				let importSymbol = new ImportSymbol(this);
				if (!importSymbol.scan())
				  return false;
				this.items.push(importSymbol);
				if ( this.token.is(TK.CommaToken) ) {
				  if (this.token.nextChar() == ' ')
					  this.commasHaveSpaces = true;
					continue;
				}
			}

			if ( this.token.is(TK.CloseBraceToken) ) {
				this.endTrivia = this.token.trivia;
				return true;
			}

			return false;
		}
	}

  public asText():string {
		if (this.parent == null)
		  return '';

		this.cursorPosAfterAsText = 0;

    if (this.items.length == 0) {
		  if ((this.parent as ImportStatement).bracesHavePadding) {
				this.cursorPosAfterAsText = 1;
				return '  ';
			}
  		return '';
		}

		let padding = (
			(this.parent as ImportStatement).bracesHavePadding &&   // <-- the statement wants padding and..
			ss.getNextNewlinePosR(this.items[0].nameTrivia) == -1 ? // <-- no new lines
			' ':
			''
		);
		let result = ss.ifBlank(this.items[0].nameTrivia,padding) + this.items[0].nameAndAlias;
		for (let i = 1; i < this.items.length; i++)	 {
      result += ',' + ss.ifBlank(this.items[i].nameTrivia, (this.commasHaveSpaces ? ' ' : '') ) + this.items[i].nameAndAlias;
		}
		this.cursorPosAfterAsText = result.length;
		result += ss.ifBlank(this.endTrivia,padding);
 		return result;
	}

	public byName(symbolName:string):boolean {
		this.isFound = false;
		this.foundSymbol = null;
    for (let sym of this.items) {
			if (sym.name == symbolName) {
				this.isFound = true;
				this.foundSymbol = sym;
			}
		}
    return this.isFound;
	}

  /**
	 * adds the passed in symbols to the end of this object's symbol array preserving any symbol trivia
	 */
	public append(symbols:ImportSymbols) {
		this.appendWarning = '';
		let [endTriviaTop,endTriviaBottom] = splitTrivia(this.endTrivia);
		let indentTrivia = this.indentTrivia;
		let ct = 1;
		for (let symbol of symbols.items) {
			if (this.byName(symbol.name)) {
				// it's already here so, we won't add it.
				if (this.foundSymbol!.alias != '')
				  this.appendWarning = ss.newLines(this.appendWarning, 'symbol "'+symbol.name+'" is already being imported as alias "'+this.foundSymbol!.alias+'"');
			} else {
        let newSymbol = new ImportSymbol();
			  newSymbol.assign(symbol);
				if (ct++ == 1)
					newSymbol.nameTrivia = endTriviaTop + indentTrivia;
				else
					newSymbol.nameTrivia = indentTrivia;
        this.items.push(newSymbol);
			}
		}
  	this.endTrivia = endTriviaBottom;

	}

}

/**
 * represents an import statement
 */
export class ImportStatement extends Scanable {
	private _universalPathModuleSpecifier: string = '';
	private _moduleSpecifierJuggler = new as.ModuleSpecifierJuggler('');

  public isUnderstood:boolean = false;
	public startLocation = new vs.Location;
	public endLocation = new vs.Location;

  public indentCharacters: string = '';

	public hasSymbols:boolean = false;
	public hasType:boolean = false;

  public useModuleSpecifierExt: boolean = false;
  public useModuleSpecifierIndex: boolean = false;
	public alias:string = '';
	public importKind:ImportKind = ImportKind.moduleOnly;

	public symbols: ImportSymbols;
	public moduleQuoteCharacter:string = '\'';
	public bracesHavePadding:boolean = false;
	public endsWithSemiColon:boolean = false;
  public commasHaveSpaces: boolean = false;

	public cursorPosAfterAsText:number = 0;

  /**
	 * this is only set after a {@link scan}. It is a side effect of converting the scanned inport's module specifier to a universalPathModuleSpecifier
	 * which needs to look for the module in {@link Project.sourceModules}.
	 */
  public sourceModule: SourceModule | undefined;

  public get displayModuleName(): string {
    if (this.useModuleSpecifierExt && this._moduleSpecifierJuggler.isShortened && !this.codeModuleHasIndex)
		  return this.shortenedModuleName + this._moduleSpecifierJuggler.ext;
    return this.shortenedModuleName;
  }

	public get isCode() {
	  return this._moduleSpecifierJuggler.isCode;
	};

  constructor(parent:Scanable) {
		super(parent)
    this.symbols = new ImportSymbols(this);
  }

  public initNonScannedStatement() {
		if (! docs.active)
		  return;

		this.isUnderstood = true;

    this.moduleQuoteCharacter = docs.active.usesDoubleQuotes ? '\"' : '\'';
 		this.endsWithSemiColon = docs.active.usesSemicolons;
    this.bracesHavePadding = docs.active.bracesHavePadding;
    this.commasHaveSpaces = docs.active.commasHaveSpaces;
    this.useModuleSpecifierIndex = docs.active.usesModuleIndexes;
    this.useModuleSpecifierExt = docs.active.usesModuleExt;

	}

  public get shortenedModuleName():string {
	  return ss.extractFileName(this.universalPathShortenedModuleSpecifier);
	}

  /**
    returns the identifier that would be used in code. examples:

    | import statement                 | mainIdentifier |
    |:---------------------------------|---------------:|
    |`import * as fs from 'fs';`       | `fs`           |
    |`import { read } from 'fs';`      | `read`         |
    |`import { read as rd } from 'fs';`| `rd`           |
    |`import fs from 'fs';`            | `fs`           |
    |`import 'fs';`                    | `<none>`       |

  */
  public get mainIdentifier(): string {
    if (this.symbols.items.length)
      return ss.ifBlank(this.symbols.items[0].alias, this.symbols.items[0].name);
    else if (this.hasDefaultAlias)
      return this.defaultAlias
    return this.alias;
  }

  /** indicates whether or not the code module is an `/index.js` file */
  public get codeModuleHasIndex(): boolean {
    return this._moduleSpecifierJuggler.hasIndex;
  }

  public get universalPathShortenedModuleSpecifier() {
    return this._moduleSpecifierJuggler.shortenedModuleSpecifier;
  }

  public get hasAlias(): boolean	 {
		return this.alias !== '';
	}

  public get hasDefaultAlias():boolean {
    return this.alias != '' && this.importKind == ImportKind.defaultAlias;
	}

	public get hasAllAlias():boolean {
		return this.alias != '' && this.importKind == ImportKind.allAlias;
	}

	public get allAlias():string {
		if (this.hasAllAlias)
      return this.alias;
		return '';
	}

	public get defaultAlias(): string {
		if (this.hasDefaultAlias)
      return this.alias;
		return '';
	}

	public get isModuleOnly(): boolean {
		return !this.hasAlias && !this.hasSymbols;
	};

  public get universalPathModuleSpecifier(): string {
    return this._universalPathModuleSpecifier;
  }
  public set universalPathModuleSpecifier(value: string) {
    this._universalPathModuleSpecifier = value;
    this._moduleSpecifierJuggler = new as.ModuleSpecifierJuggler(value);
  }


  /**
	 * two import statements are said to have the same type if one can be assigned and/or merged with the other.
	 * - obvious case:
	 *   - `import * as ss from 'system'`  is the same type as `import * as sys from 'system'`
	 *   - in the above example, you can overwrite one "all-alias" with the other (i.e `ss` with `sys` in the example)
	 *
	 * - complex case:
	 *   - `import sys from 'system'` is the same type as `import {files, folders} from 'system'`
	 *   - the above examples are the same type because you can merge them to form `import sys, {files, folders} from 'system'`
	 *
	 * - not the same:
	 *   - `import sys from 'system'` is not the same type as `import * as sys from 'system'`
	 *   - the above examples are not same type because changing one to the other is likely to break the import atatement
	 */
  public isSameTypeAs(otherImportStatement:ImportStatement)  {
    // basic check, if either statement could not be understood by the parser, we can't say they are the same type
		if (!
			(
				this.isUnderstood == true &&
				otherImportStatement.isUnderstood == true
			)
    )
		  return false;

    // non compound types
    if (
			this.isModuleOnly == otherImportStatement.isModuleOnly &&
			this.hasAllAlias == otherImportStatement.hasAllAlias
		)
		  return true;

    // compound types
		return (
		  this.hasType == otherImportStatement.hasType &&
			(this.hasSymbols || this.hasDefaultAlias) &&
			(otherImportStatement.hasSymbols || otherImportStatement.hasDefaultAlias)
		);
	}

  /**
	 * check to see if two statements point to the same physical module.  Even if the two module specifiers look very
	 * different, they can point to the same module.  It takes a bit of module specifier manipulation to find out if
	 * they are the same. This assumes that the two statements are both associated with the active module or meant for
	 * inserting into the active module.
	 */
	public isSameModuleAs(otherImportStatement: ImportStatement) {
	  return this.universalPathShortenedModuleSpecifier == otherImportStatement.universalPathShortenedModuleSpecifier;
	}

  /**
   * returns the module specifier for the import statement with the shortest (or most appropriate) path possible.
   * The most important thing for shortening the path is knowing the importing module's path.  This uses the {@link ImportStatement.parent}
   * (which should point to a {@link Module} to get the importing module's path.)
   */
	public get moduleSpecifier(): string {
    // if this is node_modules specifier, just return it.
	  if (!ss.isAbsolutePath(this.universalPathModuleSpecifier))
		  return this.universalPathModuleSpecifier;

	  let bestPath = ss.extractPath((this.parent as Module).project.getBestShortenedModuleSpecifier(this.parent as Module, this.universalPathShortenedModuleSpecifier));
		let moduleSpecifierJuggler = new as.ModuleSpecifierJuggler(bestPath + ss.extractFileName(this.universalPathShortenedModuleSpecifier));
	  return (
		  moduleSpecifierJuggler.asString({
			  includeIndex: this.useModuleSpecifierIndex,
				includeExt: this.useModuleSpecifierExt,
			})
	  );
	}


  /**
	 * use the async function: {@link setQuotedModuleSpecifier}() to set.
	 */
  public get quotedModuleSpecifier():string {
	  return (
		  this.moduleQuoteCharacter +
			this.moduleSpecifier +
			this.moduleQuoteCharacter
		);
	}

  /**
	 * setting this also sets the {@link universalPathModuleSpecifier} and {@link sourceModule}.
	 */
  public async setQuotedModuleSpecifier(quotedString:string) {
		this.moduleQuoteCharacter = quotedString.charAt(0);
		let anyModuleSpecifier = ss.trimChars(quotedString,[this.moduleQuoteCharacter]);

    let moduleSpecifierJuggler = new as.ModuleSpecifierJuggler(anyModuleSpecifier);
		this.useModuleSpecifierIndex = moduleSpecifierJuggler.hasIndex;
    this.useModuleSpecifierExt = as.cHiddenCodeExtensionsRank.includes(moduleSpecifierJuggler.ext);

		let {universalPathModuleSpecifier, sourceModule} = await (this.parent as Module).project.getUniversalPathModuleSpecifier((this.parent as Module).path, anyModuleSpecifier);
		this.universalPathModuleSpecifier = universalPathModuleSpecifier;
		this.sourceModule = sourceModule;
	}

	public asText():string {
  	this.cursorPosAfterAsText = -1;

		let result = 'import';
		if (!this.isModuleOnly) {
			if (this.hasType)
			  result += ' type';

      if (this.hasAllAlias) {
			  result += ' * as ' + this.allAlias;
				this.cursorPosAfterAsText = result.length;
			} else {

				if (this.hasDefaultAlias) {
					result += ' ' + this.defaultAlias;
					this.cursorPosAfterAsText = result.length;
					if (this.hasSymbols)
					  result += ',';
				}

				if (this.hasSymbols) {
				  result += ' {';
					this.cursorPosAfterAsText = result.length;
					result += this.symbols.asText();
  				this.cursorPosAfterAsText += this.symbols.cursorPosAfterAsText;
					result += '}';
				}

		  }
			result += ' from';
		}

		result += ' ' + this.quotedModuleSpecifier;
		if (this.endsWithSemiColon)
		  result += ';';

    if (this.cursorPosAfterAsText == -1)
		  this.cursorPosAfterAsText = result.length;

		return result;
	}

	private async scanModule():Promise<boolean> {
		if ( this.token.is(TK.FromKeyword) )
			if ( this.token.nextIs(TK.StringLiteral) ) {
				await this.setQuotedModuleSpecifier(this.token.text);
				return true;
			}
    return false;
	}

	private scanSymbolsAndModule() {
		if (this.token.nextChar() == ' ')
  	  this.bracesHavePadding = true;
		if (this.symbols.scan()) {
			this.hasSymbols = true;
			this.commasHaveSpaces = this.symbols.commasHaveSpaces;
			this.token.getNext();
			return this.scanModule();
		}
    return false;
	}

	private scanAllAlias() {
		if (this.token.nextIs(TK.AsKeyword))
		  this.token.getNext();
			if (this.token.kind == TK.Identifier || this.token.isAKeyword) {
				this.alias = this.token.text;
				this.token.getNext();
				return this.scanModule();
			}
		return false;
	}

	/**
	 * possible import statements:
	 * import '<module>'
	 * import <DefaultAlias> from '<Module>'
	 * import <DefaultAlias>, {<Symbols>} from '<Module>'
	 * import {<Symbols>} from '<Module>'
	 * import * as <AllAlias> from '<Module>'
	 *
	 * most of the above are also possible with the 'type' keyword:
	 * import type <DefaultAlias> from '<Module>'
	 * import type {<Symbols>} from '<Module>'
	 * import type * as <AllAlias> from '<Module>'
	 */
	private async scanImportStatement():Promise<boolean> {
		this.token.getNext();

		// import '<module>'
		if ( this.token.is(TK.StringLiteral) ) {
      this.importKind = ImportKind.moduleOnly;
			this.setQuotedModuleSpecifier(this.token.text);
			return true;

    // import type ...
  	} else if ( this.token.is(TK.TypeKeyword) ) {
			this.hasType = true;
			this.token.getNext();

			// import type ... <DefaultAlias> from '<Module>'
			if (this.token.is(TK.Identifier)) {
 		 	  this.importKind = ImportKind.defaultAlias;
				this.alias = this.token.text;
				this.token.getNext();
				return this.scanModule();

			// import type ... {<Symbols>} from '<Module>'
			} else if ( this.token.is(TK.FirstPunctuation,'{') ) {
				this.importKind = ImportKind.symbolsOnly;
				return this.scanSymbolsAndModule();

			// import type * as <AllAlias> from '<Module>'
			} else if ( this.token.is(TK.AsteriskToken) ) {
				this.importKind = ImportKind.allAlias;
			  return this.scanAllAlias();

			}

    // import <DefaultAlias> ...
		} else if ( this.token.is(TK.Identifier) ) {
			this.importKind = ImportKind.defaultAlias;
			this.alias = this.token.text;
			this.token.getNext();

			// import <DefaultAlias> ... , {<Symbols>} from '<Module>'
		  if ( this.token.is(TK.CommaToken) ) {
  			if ( this.token.nextIs(TK.FirstPunctuation,'{') ) {
          return this.scanSymbolsAndModule();
				}


      // import <DefaultAlias> ... from '<Module>'
			} else {
 			  return this.scanModule();

			}

		// import {<Symbols>} from '<Module>'
		} else if ( this.token.is(TK.FirstPunctuation,'{') ) {
			this.importKind = ImportKind.symbolsOnly;
			return this.scanSymbolsAndModule();

		// import * as <Alias> from '<Module>'
		} else if ( this.token.is(TK.AsteriskToken) ) {
			this.importKind = ImportKind.allAlias;
			return this.scanAllAlias();

		}

    return false;
	}

	public async scan() {
		let skipPos = this.token.endPos+1;
    this.indentCharacters = ss.getEndChars(splitTrivia(this.token.trivia)[1],[' ','\t']);
		this.startLocation = this.token.startLocation;
		this.isUnderstood = await this.scanImportStatement();
		if (this.isUnderstood) {
			if (this.token.nextIs(TK.SemicolonToken))
			  this.endsWithSemiColon = true;
			else
			  this.token.goBack();
		}
		this.endLocation = this.token.endLocation;
		if (!this.isUnderstood)
			this.token.sourcePos = skipPos;
		return this.isUnderstood;
	}

}
