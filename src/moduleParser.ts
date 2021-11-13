/**
 * @module Module
 *

Typescript Preferences

JavaScript › Format: Insert Space After Comma Delimiter: boolean (use for symbol lists)
JavaScript › Format: Insert Space After Opening And Before Closing Nonempty Braces: boolean
JavaScript › Format: Semicolons
  ignore - auto
  insert - always add
  remove - never add
JavaScript › Preferences: Import Module Specifier:
  shortest - looks at base-relative (aka "non-relative") vs. relative, takes the one with the shortest number of dir segments
  relative - always take the relative path
  non-relative - always take the base-relative (aka "non-relative")
  project relative - no clue
JavaScript › Preferences: Import Module Specifier Ending:
  auto - no preference, just go by what's in the module, or else minimal
  minimal - never show an extension, or /index
  index - use a /index if one exists, but no extensions
  js - show extensions
JavaScript › Preferences: Quote Style
  auto
  single
  double

 */
import * as ss from './common/systemSupport';
import { ImportStatement } from './importStatementParser';
import { Token, Scanable, TK } from './token';
import { Project } from './project';
import * as as from './appSupport';

const cMaxNonImportTokens = 20;


/**
 * parses module code to read the import statements.  While doing that, it also determines important locations in
 * the code (like where the import statements are) as well as identifying different programming style aspects
 * such as the use of semicolons, and double quotes vs single quotes.
 */
export class Module extends Scanable {
  private _file: string = '';
  protected _token:Token = new Token();

  public isTypescript:boolean = false;
  public isSvelte:boolean = false;

  /**
   * the project this module can be found in.  This is mainly needed to convert moduleSpecifiers to universalPathModuleSpecifiers
   * when import statements are parsed.
   */
  public project: Project;

  /**
   * indicates the insert position for the temporary import statements used by the node module loader, and symbol loader.
   * In a svelte module, it is at the end of the <script> tag, normally it would be at character 0 of the module.
   */
  public svelteTempInsertPos: number = 0;

  public get file(): string {
    return this._file;
  }
  public set file(value: string) {
    this._file = value;
    this.isTypescript = as.isTypescriptFile(value);
    this.isSvelte = as.isSvelteFile(value);
  }

  public importStatements:ImportStatement[] = [];

  /**
   * the position of where the next insert statement should be placed.  If there are no import statements
   * it should generally be before the first symbol.  If there are comments before the first symbol, it should
   * be after the last comment character.  Also, if inserting at the end of an existing import section, it will
   * be set so that any inline comments at the end of the statement are kept as is.
   */
  public nextImportInsertPos:number = 0;

  /**
   * the number of newlines to be inserted before the next import statement that is to be added.  When inserting
   * a new statement at position 0, no newlines should be added, but if inserting after comments, 2 newlines should
   * be added, and only one added if inserting at the end of an existing the insert section.
   */
  public nextImportNewlinesBefore:number = 0;

  /**
   * the number of newlines to be inserted after the next import statement that is to be added. This is only greater
   * than zero when we're inserting into position 0 of the source code.
   */
  public nextImportNewlinesAfter: number = 0;

  /**
   * the first character on the next line after the import section
   */
  public importsEndLinePos:number = 0;

  /**
   * the indent characters found after a scan (if any)
   */
  public importIndentCharacters: string = '';

  /**
   * the default indent characters that should be added before adding an import ststement to the code. (to use in case the module
   * has no import statements already to use an an example)
   */
  public defaultImportIndentCharacters: string = '';

	constructor(project:Project) {
    super(undefined);
		this.project = project;
	}


	public get path(): string {
    return ss.extractPath(this.file);
  }


  /**
   * the first character of the first import statement
   */
	public get importsStartPos():number {
    return this.importStatements[0]?.startLocation.position ?? -1;
  }

  /**
   * the last character of the last import statement (usually a semicolon or a quote)
   */
  public get importsEndPos():number {
    return this.importStatements[this.importStatements.length-1]?.endLocation.position ?? -1;
  }


  public get sourceCode():string {
    return this.token.sourceCode;
  }

  public set sourceCode(s:string) {
    this.token.sourceCode = s;
    this.svelteTempInsertPos = 0;
    if (this.isSvelte) {
      let match = s.match(/\<script([^>]*)>/);
      if (match && typeof match.index != 'undefined') {
        this.svelteTempInsertPos = match.index + match[0].length;
        this.token.sourcePos = this.svelteTempInsertPos;
      }
    }
  }


  public scan() {
    let justGotAnImport = false;

    this.importStatements.length = 0;

		this.token.getNext();
    let headTrivia = this.token.trivia; // <-- save this for later

    let nonImportTokenCount = 0;

    // scan enough tokens to pull in everything we need to know about the import section of the code
		while (this.token.kind != TK.EndOfFileToken && nonImportTokenCount <= cMaxNonImportTokens) {

			if (this.token.kind == TK.ImportKeyword) {
        nonImportTokenCount = 0;
				let importStatement = new ImportStatement(this);
				importStatement.scan();
        if (importStatement.isUnderstood) {
				  this.importStatements.push(importStatement);
          justGotAnImport = true;
        }
      } else if (this.token.kind == TK.RequireKeyword) {
        // although we don't handle require statements, it is a clue that we're still in the import area
        nonImportTokenCount = 0;
      } else
        nonImportTokenCount++;

			this.token.getNext();
      if (justGotAnImport) {
        this.importsEndLinePos = this.token.startPos-1;
        justGotAnImport = false;
      }
		}

    this.importIndentCharacters = '';
    this.nextImportInsertPos = 0;
    this.nextImportNewlinesBefore = 0;
    this.nextImportNewlinesAfter = 0;
    if (this.isSvelte) {
      this.nextImportInsertPos = this.svelteTempInsertPos;
      this.nextImportNewlinesBefore = 1;
    }
    if (this.importStatements.length > 0) {
      this.importIndentCharacters = this.importStatements[0].indentCharacters;
      this.nextImportInsertPos = this.importsEndPos+1;
      this.nextImportNewlinesBefore = 1;
      this.nextImportInsertPos = ss.getNextNewlinePos(this.sourceCode,this.nextImportInsertPos);
    } else {
      this.nextImportNewlinesAfter = 1;
      if (this.isSvelte)
        this.importIndentCharacters = this.defaultImportIndentCharacters;
      let newlineMatches = Array.from(headTrivia.matchAll(/^[^\S\r\n]*\S.*$/mg)); // <-- find all lines that have at least 1 non-whitespace character
      if (newlineMatches.length > 0) {
        let lastNewlineMatch = newlineMatches[newlineMatches.length-1];
        this.nextImportInsertPos = this.svelteTempInsertPos + (lastNewlineMatch.index ?? 0) + lastNewlineMatch[0].length;
        if (this.isSvelte && lastNewlineMatch.index == 0)
          this.nextImportNewlinesBefore = 1;  // <-- this is right after a <svelte> tag
        else
          this.nextImportNewlinesBefore = 2;
      }
    }

  }

  public get usesSemicolons():boolean | undefined {
    if (this.importStatements.length == 0)
      return undefined;
    let ct = 0;
    for (let stm of this.importStatements)
      if (stm.endsWithSemiColon)
        ct++;
    // uses semicolons if at least 50% of the statements use semicolons.
    return (Math.round(ct * 100 / this.importStatements.length) >= 50);
  }

  public get bracesHavePadding():boolean | undefined {
    let hasSymbolsCt = 0;
    let ct = 0;
    for (let stm of this.importStatements)
      if (stm.hasSymbols) {
        hasSymbolsCt++;
        if (stm.bracesHavePadding)
          ct++;
      }
    if (hasSymbolsCt == 0)
      return undefined;
    // uses padding if at least 50% of the statements use padding.
    return (Math.round(ct * 100 / hasSymbolsCt) >= 50);
  }

  public get usesDoubleQuotes():boolean | undefined {
    if (this.importStatements.length == 0)
      return undefined;
    let ct = 0;
    for (let stm of this.importStatements)
      if (stm.moduleQuoteCharacter == '"')
        ct++;
    // uses double quotes if at least 50% of the statements use double quotes.
    return (Math.round(ct * 100 / this.importStatements.length) >= 50);
  }

  public get usesModuleExtensions():boolean | undefined {
    if (this.importStatements.length == 0)
      return undefined;
    let ct = 0;
    for (let stm of this.importStatements)
      if (stm.useModuleSpecifierExt)
        return true;
    return false;
  }

  public get usesModuleIndexes():boolean | undefined {
    if (this.importStatements.length == 0)
      return undefined;
    for (let stm of this.importStatements)
      if (stm.useModuleSpecifierIndex)
        return true;
    return false;
  }

  public get commasHaveSpaces():boolean | undefined {
    if (this.importStatements.length == 0)
      return undefined;
    for (let stm of this.importStatements)
      if (stm.commasHaveSpaces)
        return true;
    return false;
  }

}

