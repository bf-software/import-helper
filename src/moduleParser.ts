/**
 * @module Module
 *
 * represents a ts, tsx, js, jsx, or svelte module.  Svelte modules can have up to 2 <script> tags
 * each with their own import statements.  Normally, `export` statements in svelte modules pertain
 * to the attributes offered by the default Svelte component being described and exported by that
 * module. An additional script tag with the attribute `context="module"` can be used to allow a
 * .svelte module to use normal javascript export statements to export additional symbols besides
 * the main svelte object as a default export. When svelte compiles, all of the imports from each
 * script tag will be placed together in the final module. see the `js output` tab here:
 * https://svelte.dev/repl/ae5a44929ff342779235696ccba178bd?version=3.52.0
 *
 * therefore, when scanning svelte modules, each tag svelte needs to get scanned on its own, but
 * they are all considered to be in the same level of the module.  That is, code in any script tag
 * may reference the imports of any other script tags in the module.
 *
 * when importing, the nearest script tag above the cursor will receive the new import.
 *
 *
 * Typescript Preferences
 *
 * JavaScript › Format: Insert Space After Comma Delimiter: boolean (use for symbol lists)
 * JavaScript › Format: Insert Space After Opening And Before Closing Nonempty Braces: boolean
 * JavaScript › Format: Semicolons
 *   ignore - auto
 *   insert - always add
 *   remove - never add
 * JavaScript › Preferences: Import Module Specifier:
 *   shortest - compares the searchable (aka "non-relative") path vs. relative path and takes the one with the shortest number of dir segments
 *   relative - always take the relative path
 *   non-relative - always use the searchable (aka "non-relative") path, if not found, fall back to relative
 *   project-relative - uses a relative path, unless the relative path would leave the project hierarchy, then it will try to use a searchable (aka "non-relative") path
 * JavaScript › Preferences: Import Module Specifier Ending:
 *   auto - no preference, just go by what's in the module, or else minimal
 *   minimal - never show an extension, or /index
 *   index - use a /index if one exists, but no extensions
 *   js - show extensions
 * JavaScript › Preferences: Quote Style
 *   auto
 *   single
 *   double
 *
 */
import * as ss from './common/systemSupport';
import { ImportStatement } from './importStatementParser';
import { Token, Scanable, TK } from './token';
import { Project } from './project';
import * as as from './appSupport';
import * as vs from './common/vscodeSupport';

const cMaxNonImportTokens = 20;

export class ImportSection {
  /**
   * the location of where parsing should begin. For normal modules, this is always at position 0, but for svelte,
   * it needs to be the first character after the <script ...> tag.
   */
  public parseStartLocation:vs.Location = new vs.Location(0,0,0);

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


  public importStatements:ImportStatement[] = [];


  /**
   * the first character of the first import statement
   */
	public get importsStartPos():number {
    return this.importStatements[0]?.startLocation.position ?? this.parseStartLocation.position;
  }

  /**
   * the last character of the last import statement (usually a semicolon or a quote)
   */
  public get importsEndPos():number {
    return this.importStatements.at(-1)?.endLocation.position ?? this.parseStartLocation.position;
  }

}

/**
 * parses module code to read the import statements inside of one or more import sections and make note of where
 * they are located.  While doing that, it also identifies different programming style aspects such as the use of
 * semicolons, and double quotes vs single quotes.
 */
export class Module extends Scanable {
  private _file: string = '';
  protected _token:Token = new Token();

  public isTypescript:boolean = false;
  public isSvelte:boolean = false;
  public currentCursorPos:number = 0;

  /**
   * the project this module can be found in.  This is mainly needed to convert moduleSpecifiers to universalPathModuleSpecifiers
   * when import statements are parsed.
   */
  public project: Project;

  /**
   * after {@link scan}(), this indicates the insert position for the temporary import statement used by the node module loader, and symbol loader.
   * In a svelte module, it is at the end of the first `<script>` tag, otherwise it is at character 0.
   */
  public tempImportInsertPos: number = 0;

  public get file(): string {
    return this._file;
  }
  public set file(value: string) {
    this._file = value;
    this.isTypescript = as.isTypescriptFile(value);
    this.isSvelte = as.isSvelteFile(value);
  }

  public importSections:ImportSection[] = [];

  /**
   * always points to the section the cursor is nearest to after a successful scan.
   */
  public selectedImportSection:ImportSection = new ImportSection();

  /**
   * gets the import section above the `selectedImportSection`. If it is already at the top section, it simply returns
   * selectedImportSection.
   */
  public get priorImportSection():ImportSection {
    let i = ss.noLowerThan(this.importSections.indexOf(this.selectedImportSection)-1, 0);
    return this.importSections[i];
  }


  /**
   * gets the import section below the `selectedImportSection`. If it is already at the lowest section, it simply returns
   * selectedImportSection.
   */
  public get nextImportSection():ImportSection {
    let i = ss.noHigherThan(this.importSections.indexOf(this.selectedImportSection)+1, this.importSections.length-1);
    return this.importSections[i];
  }



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


  public get sourceCode():string {
    return this.token.sourceCode;
  }

  public set sourceCode(s:string) {
    this.token.sourceCode = s;
    this.tempImportInsertPos = 0;
    if (this.isSvelte) {
      let match = s.match(/\<script([^>]*)>/);
      if (match && typeof match.index != 'undefined') {
        this.tempImportInsertPos = match.index + match[0].length;
      }
    }
  }

  private getEmptyImportSections():ImportSection[] {
    let result:ImportSection[] = [];
    if (this.isSvelte) {
      let matches = this.token.sourceCode.matchAll(/<script(|\s+.*?)>/g);
      for (let match of matches)
        if (typeof match.index == 'number') {
          let position = match.index + match[0].length - 1;
          let {line, column} = ss.positionToLineColumn(this.token.sourceCode,position);
          let section = new ImportSection();
          section.parseStartLocation = new vs.Location(position, line, column);
          result.push(section);
        }
    } else {
      result.push(new ImportSection());
    }
    return result;
  }

  /**
   * takes the {@link sourceCode} and identifies various aspects of it having to do with imports, such
   * as:
   *
   *
   */
  public async scan() {


   // let result = await this.internalScan();
    //this.importStatements = result.importStatements;


    let justGotAnImport = false;

    this.importSections = this.getEmptyImportSections();

    // loop through the import sections, gathering the actual import statements
    for (let i = 0; i < this.importSections.length; i++) {
      let importSection = this.importSections[i];
      let nextImportSection = this.importSections.at(i+1);
      this.token.sourcePos = importSection.parseStartLocation.position;
      this.token.startLine = importSection.parseStartLocation.line;
      this.token.startColumn = importSection.parseStartLocation.column;

      this.token.getNext();
      let headTrivia = this.token.trivia; // <-- save this for later

      let nonImportTokenCount = 0;

      let maxSourcePos = (nextImportSection ? nextImportSection.parseStartLocation.position : Number.MAX_SAFE_INTEGER);

      // scan enough tokens to pull in everything we need to know about the import section of the code
      // ( when we hit EOF, hit another import section, or we detect that an import token hasn't been read in a while, we stop scanning )
      while (this.token.kind != TK.EndOfFileToken && nonImportTokenCount <= cMaxNonImportTokens && this.token.sourcePos < maxSourcePos ) {

        if (this.token.kind == TK.ImportKeyword) {
          nonImportTokenCount = 0;
          let importStatement = new ImportStatement(this);
          await importStatement.scan();
          if (importStatement.isUnderstood) {
            importSection.importStatements.push(importStatement);
            justGotAnImport = true;
          }
        } else if (this.token.kind == TK.RequireKeyword) {
          // although we don't handle require statements, it is a clue that we're still in the import area
          nonImportTokenCount = 0;
        } else
          nonImportTokenCount++;

        this.token.getNext();
        if (justGotAnImport) {
          importSection.importsEndLinePos = this.token.startPos-1;
          justGotAnImport = false;
        }
      }

      // we found all of the import statements we could, now examine them a little closer
      importSection.importIndentCharacters = '';
      importSection.nextImportInsertPos = 0;
      importSection.nextImportNewlinesBefore = 0;
      importSection.nextImportNewlinesAfter = 0;
      if (this.isSvelte) {
        importSection.nextImportInsertPos = this.tempImportInsertPos;
        importSection.nextImportNewlinesBefore = 1;
      }
      if (importSection.importStatements.length > 0) {
        importSection.importIndentCharacters = importSection.importStatements[0].indentCharacters;
        importSection.nextImportInsertPos = importSection.importsEndPos+1;
        importSection.nextImportNewlinesBefore = 1;
        importSection.nextImportInsertPos = ss.getNextNewlinePos(this.sourceCode,importSection.nextImportInsertPos);
      } else {
        importSection.nextImportNewlinesAfter = 1;
        if (this.isSvelte)
          importSection.importIndentCharacters = this.defaultImportIndentCharacters;
        let newlineMatches = Array.from(headTrivia.matchAll(/^[^\S\r\n]*\S.*$/mg)); // <-- find all lines that have at least 1 non-whitespace character
        if (newlineMatches.length > 0) {
          let lastNewlineMatch = newlineMatches[newlineMatches.length-1];
          importSection.nextImportInsertPos = importSection.parseStartLocation.position + (lastNewlineMatch.index ?? 0) + lastNewlineMatch[0].length;
          if (this.isSvelte && lastNewlineMatch.index == 0)
            importSection.nextImportNewlinesBefore = 1;  // <-- this is right after a <svelte> tag
          else
            importSection.nextImportNewlinesBefore = 2;
        }
      }

    } // for importSections


    // make a note of the selected section for use later
    this.selectedImportSection = this.importSections[0];
    if (this.importSections.length > 1) {
      for (let i = this.importSections.length-1; i >= 0; i--) {
        let section = this.importSections[i];
        if (this.currentCursorPos >= section.parseStartLocation.position) {
          this.selectedImportSection = section;
          break;
        }
      }
    }

  }

  public eachImportStatement(func:(importStatement:ImportStatement)=>undefined | any) {
    for (let importSection of this.importSections)
      for (let importStatement of importSection.importStatements) {
        let result = func(importStatement);
        if (typeof result != 'undefined')
          return result;
      }
  }

  public get hasStatements():boolean {
    return this.eachImportStatement(() => {
      return true;
    }) ?? false;
  }

  public get usesSemicolons():boolean | undefined {
    let ct = 0;
    let total = 0;
    this.eachImportStatement((stm) => {
      if (stm.endsWithSemiColon)
        ct++;
      total++;
    });
    if (total == 0)
      return undefined;
    // uses semicolons if at least 50% of the statements use semicolons.
    return (ct * 100 / total) >= 50;
  }

  public get bracesHavePadding():boolean | undefined {
    let hasSymbolsCt = 0;
    let ct = 0;
    this.eachImportStatement((stm) => {
      if (stm.hasSymbols) {
        hasSymbolsCt++;
        if (stm.bracesHavePadding)
          ct++;
      }
    });
    if (hasSymbolsCt == 0)
      return undefined;
    // uses padding if at least 50% of the statements use padding.
    return (Math.round(ct * 100 / hasSymbolsCt) >= 50);
  }

  public get usesDoubleQuotes():boolean | undefined {
    let ct = 0;
    let total = 0;
    this.eachImportStatement((stm) => {
      if (stm.moduleQuoteCharacter == '"')
        ct++;
      total++;
    });
    if (total == 0)
      return undefined;
    // uses double quotes if at least 50% of the statements use double quotes.
    return (ct * 100 / total) >= 50;
  }

  public get usesModuleExtensions():boolean | undefined {
    if (!this.hasStatements)
      return undefined;
    let result = this.eachImportStatement((stm) => {
      if (stm.useModuleSpecifierExt)
        return true;
    });
    if (result === true)
      return true;
    return false;
  }

  public get usesModuleIndexes():boolean | undefined {
    if (!this.hasStatements)
      return undefined;
    let result = this.eachImportStatement((stm) => {
      if (stm.useModuleSpecifierIndex)
        return true;
    });
    if (result === true)
      return true;
    return false;
  }

  public get commasHaveSpaces():boolean | undefined {
    if (!this.hasStatements)
      return undefined;
    let result = this.eachImportStatement((stm) => {
      if (stm.commasHaveSpaces)
        return true;
    });
    if (result === true)
      return true;
    return false;
  }

}
