import * as vscode from 'vscode';
import * as ss from './common/systemSupport';
import { Module } from './moduleParser';
import { projects, Project } from './project';
import * as cs from './common/collectionSupport';
import * as as from './appSupport';
import { Token, TK } from './token';


/** represents the full or partial symbol to the left of the cursor when import helper is invoked. */
export class EditorSearchSymbol {
  public text:string = '';
  public isComplete:boolean = false;
  public isSymbol:boolean = false;
  public startPos:number|undefined;
}


export class Document {
  public module:Module | undefined;
  public project:Project | null = null;
  public bookmarks = new Map<string,number>();
  public vscodeDocument:vscode.TextDocument | undefined;

  /**
   * @member vscodeTextEditor() this gets assigned to the active editor by @member syncEditor(). Every
   * time you switch tabs to another document, vscode's active editor instance is recreated, so we can't
   * hold on to the same editor instance forever.
   */
  private vscodeTextEditor:vscode.TextEditor | undefined;

  /** when true, the document records the time and line of the last change. Turn off temporarily when making internal changes to the code. */
  public recordLastChange: boolean = true;
  public lastChangedTime = new Date();
  /** the first line is 0 */
  public lastChangedLine = -1;

  constructor(vscodeDocument:vscode.TextDocument ) {
    this.vscodeDocument = vscodeDocument;
  }

  public get isTypescript(): boolean {
    return as.isTypescriptFile(this.vscodeDocument?.fileName ?? '');
  }

  public get isSvelte():boolean {
    return as.isSvelteFile(this.vscodeDocument?.fileName ?? '');
  }

  public get isCode():boolean {
    return as.isCodeFile(this.vscodeDocument?.fileName ?? '');
  }

  public get msecSinceLastChange():number {
    return (new Date()).getTime() - this.lastChangedTime.getTime();
  }

  public get uri():vscode.Uri | undefined {
    return this.vscodeDocument?.uri;
  }

  /**
   * this must be called before any other calls to this object.  It makes sure all of the members are pointing
   * to the correct (active) places.
   */
  public syncEditor() {
    this.vscodeTextEditor = vscode.window.activeTextEditor;
  }

  /**
   * parses the current document if it a code module
   */
	public parseModule() {
    this.module = new Module(this.project!);
    this.module.file = this.file;
    if (this.isCode) {
      this.module.sourceCode = this.sourceCode;
      if (this.module.isSvelte) {
        let insertSpaces = vscode.workspace.getConfiguration('editor',this.vscodeDocument?.uri).get<boolean>('insertSpaces') ?? false;
        let tabSize = vscode.workspace.getConfiguration('editor',this.vscodeDocument?.uri).get<number>('tabSize') ?? 2;
        this.module.defaultImportIndentCharacters = (insertSpaces ? ' '.repeat(tabSize) : '\t');
      }
		  this.module.scan();
    }
	}

  /** gets the line the cursor is on. The first line is 0.*/
  public getCursorLine() {
    return this.vscodeTextEditor!.selection.end.line;
  }

  public getCh(pos:number):string {
    let fromPosition = this.posToPosition(pos);
    let toPosition = this.posToPosition(pos+1);
    return this.vscodeDocument!.getText( new vscode.Range(fromPosition,toPosition) );
  }

  /**
    returns a token suitable for using as the default string in an Add Import module search.
    Complete (non-partial) symbols will start with double quotes.
  */
  public parseEditorSearchSymbol(): EditorSearchSymbol {

    // grab the text of the source line left of the cursor
    let linePos = this.cursorPos - 1;
    let ch = '';
    let sourceLine = '';
    while ( true ) {
      ch = (linePos >= 0 ? this.getCh(linePos) : '\n')
      if (ch.includes('\n')) // <-- on Windows the new line "character" is returned from getCh as '\r\n' (2 characters long -- even if the document is set to "LF"!)
        break;
      sourceLine = ch + sourceLine;
      linePos--;
    }

    linePos++; // <-- places the position at the first character on the line

    // parse out the left most symbol, and its following character
    let token = new Token();
    token.sourceCode = sourceLine;
    token.getNext();
    let lastSymbol = '';
    let followingCharacter = '';
    let afterLastSymbolPos = -1;
    while (token.kind != TK.EndOfFileToken) {
      if (token.kind == TK.Identifier) {
        lastSymbol = token.text;
        afterLastSymbolPos = token.sourcePos;
        followingCharacter = sourceLine.substr(afterLastSymbolPos,1);
      }
      token.getNext();
    }

    let editorSearchSymbol = new EditorSearchSymbol();
    editorSearchSymbol.text = lastSymbol;
    editorSearchSymbol.startPos = linePos + (afterLastSymbolPos - lastSymbol.length);

    // if there are any non-space characters after the symbol, we'll assume it's complete and start it with a " so the search will look for an exact match
    let endingChars = sourceLine.substring(afterLastSymbolPos);
    if (endingChars.match(/\S/))
      editorSearchSymbol.isComplete = true;

    // if the character following the last symbol is a [ or (, then we can assume the symbol is an imported symbol, and not a module alias
    if (followingCharacter == '[' || followingCharacter == '(')
      editorSearchSymbol.isSymbol = true;

    return editorSearchSymbol;

  }


  /**
   * tsconfig.json and/or package.json file defines a project.  The document is associated with the project defined
   * by the tsconfig.json and/or package.json file in the document's current folder, or a parent folder. syncProject
   * finds and loads the project based on those files.  If the project has already been loaded, it will simply
   * that one.
   */
  public async syncProject( onLoadingMilestone: () => void ) {
    projects.onLoadingMilestone = onLoadingMilestone;
    let found = projects.byModulePath(this.path);
    if (found) {
      if (found.value.isDirty) {
        projects.delete(found.key);
        found = await projects.addProject(this.path);
      }
    } else
      found = await projects.addProject(this.path);
    if (! found)
      throw new Error('syncProject: could not find or load the project.');
    this.project = found.value;
  }

  public get file():string {
    return ss.internalizeFile(this.vscodeDocument?.fileName ?? '');
  }

  public get path():string {
    return ss.extractPath(this.file);
  }

  public get cursorPos():number {
    return this.positionToPos(this.cursorPosition);
  }

  public get cursorPosition():vscode.Position {
    return this.vscodeTextEditor!.selection.active;
  }

  public get sourceCode():string {
    return this.vscodeDocument!.getText();
  }

  public async insertText(startPos:number, text:string, endPos?:number, allowUndo:boolean = true) {
    try {
      this.recordLastChange = false;

      let undoOptions = { undoStopBefore: true, undoStopAfter: true };
      if (! allowUndo)
        undoOptions = { undoStopBefore: false, undoStopAfter: false };
      await this.vscodeTextEditor!.edit(editBuilder => {
        if (typeof endPos == 'undefined')
          editBuilder.insert(this.posToPosition(startPos), text);
        else
          editBuilder.replace( new vscode.Range( this.posToPosition(startPos), this.posToPosition(endPos) ), text);
      },
        undoOptions
      );

    } finally {
      this.recordLastChange = true;
    }
  }

  public rememberPos(name:string, pos?:number) {
    if (typeof pos == 'undefined')
      pos = this.cursorPos;
    this.bookmarks.set(name,pos);
  }

  public forgetPos(name:string) {
    this.bookmarks.delete(name);
  }

  public hasPos(name:string) {
    return this.bookmarks.has(name);
  }

  public getPos(name:string) {
    return this.bookmarks.get(name);
  }

  public goTo(posNumOrName:number|string):void {
    let pos = this.module!.importsStartPos;
    if (typeof posNumOrName == 'number')
      pos = posNumOrName;
    else {
      pos = this.bookmarks.get(posNumOrName) ??  pos;
    }

    let position = this.posToPosition(pos);
    this.vscodeTextEditor!.selection = new vscode.Selection(position, position);
    this.vscodeTextEditor!.revealRange(this.vscodeTextEditor!.selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  public positionToPos(position:vscode.Position):number {
    let sourceCode = this.vscodeDocument!.getText(new vscode.Range(new vscode.Position(0,0), position));
    return sourceCode.length;
  }

  public posToPosition(pos:number):vscode.Position {
    let sourceCode = this.sourceCode.substr(0,pos);
    let line = (sourceCode.match(/\n/g)?.length ?? 0);
    let character = sourceCode.length - sourceCode.search(/(\n).*$/) - 1;
    return new vscode.Position( line, character );
  }


  private getSetting(subsection:string, setting:string):unknown {
		let settingsArea = 'javascript';
		if (this.isTypescript)
		  settingsArea = 'typescript';
    return vscode.workspace.getConfiguration(settingsArea+'.'+subsection,this.vscodeDocument?.uri).get(setting);
  }

  private getBooleanSetting(checkThisFirst:boolean|undefined, subsection:string, setting:string, mustBeValue:unknown):boolean {
    if (typeof checkThisFirst == 'undefined')
      return this.getSetting(subsection, setting) === mustBeValue;
    return checkThisFirst;
  }

  public get usesDoubleQuotes():boolean {
 		return this.getBooleanSetting(this.module!.usesDoubleQuotes,'preferences','quoteStyle','double');
  }

  public get usesSemicolons():boolean {
 		return this.getBooleanSetting(this.module!.usesSemicolons,'format','semicolons','insert');
  }

  public get bracesHavePadding():boolean {
    return this.getBooleanSetting(this.module!.bracesHavePadding,'format','insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces',true);
  }

  public get commasHaveSpaces():boolean {
    return this.getBooleanSetting(this.module!.commasHaveSpaces,'format','insertSpaceAfterCommaDelimiter',true);
  }

  public get usesModuleIndexes():boolean {
    return this.getBooleanSetting(this.module!.usesModuleIndexes,'preferences','importModuleSpecifierEnding','index') ||
           this.getBooleanSetting(this.module!.usesModuleIndexes,'preferences','importModuleSpecifierEnding','js');
  }

  public get usesModuleExt():boolean {
    return this.getBooleanSetting(this.module!.usesModuleExtensions,'preferences','importModuleSpecifierEnding','js');
  }

  public get pathStyle():string {
    let result = this.getSetting('preferences','importModuleSpecifier');
    if (typeof result == 'string')
      return result;
    return '';
  }

}

export class CodeDocuments extends cs.FfMap<vscode.TextDocument, Document> {
  constructor() {
    super();
    this.useLowercaseKeys = true;
  }

	public closeDocument(vscodeTextDocument: vscode.TextDocument) {
		this.delete(vscodeTextDocument);
	}

  public get active():Document | undefined {
    let vscodeTextDocument = vscode.window?.activeTextEditor?.document;
    if (! vscodeTextDocument)
      return;
    return this.addOrGet(vscodeTextDocument);
  }

  public addOrGet(vscodeTextDocument:vscode.TextDocument):Document {
    let codeDocument = this.get(vscodeTextDocument);
    if (!codeDocument) {
      codeDocument = new Document(vscodeTextDocument);
      this.set(vscodeTextDocument,codeDocument);
    }

    return codeDocument;
  }

  public documentChanged(event: vscode.TextDocumentChangeEvent) {
    let codeDocument = this.get(event.document);
    if (!codeDocument)
      return;

    // making a note of the last changed time for Add Import to use
    if (codeDocument.recordLastChange)
      codeDocument.lastChangedTime = new Date();

    for (let change of event.contentChanges) {

      // making a note of the last changed line for Add Import to use
      if (codeDocument.recordLastChange)
        codeDocument.lastChangedLine = codeDocument.vscodeDocument?.positionAt(change.rangeOffset).line ?? -1;

      // check to see if we need to shift our bookmarks
      for (let [name,pos] of codeDocument.bookmarks.entries()) {
        if (change.rangeOffset < pos) {
          // change took place before the bookmark, so we need to adjust it
          let newLength = change.text.length;
          let oldLength = change.rangeLength;

          let changeAmount = newLength - oldLength;
          pos += changeAmount;

          codeDocument.bookmarks.set(name,pos);
        }
      }
    }
  };

  public selectionChanged(event: vscode.TextEditorSelectionChangeEvent) {
    let codeDocument = this.get(event.textEditor.document);
    if (!codeDocument)
      return;
    // not doing anything, should remove.
  }


}

export let docs = new CodeDocuments();
