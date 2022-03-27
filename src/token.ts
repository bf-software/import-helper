import ts from 'typescript';
import { SyntaxKind as TK } from 'typescript';
import * as vs from './common/vscodeSupport';
import * as ss from './common/systemSupport';

/**
 * TK stands for "TokenKind"
 */
export { TK };

/**
 * returns an array of 2 elements, the second is all of the trivia from and including the last newline to the end of the string,
 * the first is everything before it.
 */
export function splitTrivia(trivia:string):string[] {
	let p = ss.getNextNewlinePosR(trivia);
	if (p == -1)
		return ['',trivia];
	if (p >= 1 && trivia.substr(p-1,1) == '\r')
		p--;
	return [trivia.substring(0,p),trivia.substr(p)];
}

export class Scanable {
  protected _token:Token | undefined;
  protected parent: Scanable | undefined;
  public set token(token:Token) {
		this._token = token;
	}

	constructor(parent?:Scanable) {
		this.parent = parent;
	}

  public get token():Token {
  	if (!this._token)
		  if (this.parent && this.parent.token)
			  this._token = this.parent.token;
    if (!this._token)
		  throw Error('token must be assigned');
		return this._token;
	}

}

export class Token {
	private scanner:ts.Scanner = ts.createScanner(ts.ScriptTarget.Latest, true);
	public kind:TK = TK.EmptyStatement;
	public lastStartPos:number = 0;
	public logTokens = false;
  private getTokenEvent: (() => void) | null = null;
	public startLine:number = 0;
	public startColumn:number = 0;

  /**
   * all of the text between the end of the prior token and the start of the current token.
   * In this example, the last token was the semicolon at the end of line 1, the next token is `import`:
   * ```
   * import * as ss from './systemSupport'; // a general library
   * import fs from 'fs';
   * ```
   * therefore, the trivia would be: `' // a general libary\n'`
   */
	public trivia:string = '';

	constructor() {
		this.scanner.setOnError( (message: ts.DiagnosticMessage, length: number) => {
			//console.error({error:'Token: error at position: '+this.sourcePos,message});
	  });
	  this.scanner.setScriptTarget(ts.ScriptTarget.Latest);
	  this.scanner.setLanguageVariant(ts.LanguageVariant.Standard);
	}

	public get text() {
		return this.scanner.getTokenText();
	}

  public get sourceCode():string {
    return this.scanner.getText();
  }

  public set sourceCode(s:string) {
    this.scanner.setText(s);
  }

	public get isAKeyword(): boolean {
		return this.kind >= TK.BreakKeyword && this.kind <= TK.OfKeyword;
	}


  /**
	 * the position of the next character to be read by the scanner
	 */
	public get sourcePos() {
		return this.scanner.getTextPos();
	}

  /**
	 * the position of the next character to be read by the scanner
	 */
	public set sourcePos(pos:number) {
		this.scanner.setTextPos(pos);
	}

	/**
	 * the position of the first character of the token
	 */
  public get startPos() {
	  return this.scanner.getTokenPos();
	}

	/**
	 * the position of the last character of token
	 */
	public get endPos() {
	  return this.startPos + this.text.length-1;
	}

	/**
	 * location of the first character of the token
	 */
	public get startLocation():vs.Location {
		return new vs.Location(this.startPos,this.startLine,this.startColumn);
	}

	/**
	 * location of the last character of the token
	 */
	public get endLocation():vs.Location {
		return new vs.Location(this.endPos,this.startLine,this.startColumn + this.text.length-1);
	}


  public onGetToken(event: (() => void) | null) {
    this.getTokenEvent = event;
  }

	public getNext() {
		let triviaStartPos = this.sourcePos;
		this.lastStartPos = this.startPos;
		this.kind = this.scanner.scan();

		// examine the trivia prior to the token to advance the line and column properties
		this.trivia = this.sourceCode.substring(triviaStartPos,this.startPos);
		let newlineMatches = Array.from(this.trivia.matchAll(/\n/g));
		this.startLine += newlineMatches.length;
		let lastTriviaLineLength:number;
		if (newlineMatches.length == 0) {
      lastTriviaLineLength = this.trivia.length
		} else {
			this.startColumn = 0;
			let lastNewlinePos = newlineMatches[newlineMatches.length-1].index ?? 0;
		  lastTriviaLineLength = this.trivia.length - newlineMatches[newlineMatches.length-1][0].length;
		}
		this.startColumn += lastTriviaLineLength;

    if (this.getTokenEvent)
      this.getTokenEvent();

		if (this.logTokens)
			console.log(
				(''+this.kind).padEnd(5)+'| '+
				TK[this.kind].padEnd(15)+'| '+
				('"'+this.text+'"').padEnd(20)+' |'+
				('tx.p: '+this.startPos).padEnd(10)+' |'+
				('tk.p: '+this.endPos).padEnd(10)+' |'
			);
	}

	private peekNext() {
		let lastPos = this.startPos;
		this.getNext();
		this.scanner.setTextPos(lastPos);
	}

	public nextChar() {
    return this.sourceCode.substr(this.sourcePos,1);
	}

  public goBack() {
		this.scanner.setTextPos(this.lastStartPos);
		this.getNext();
	}

	public is(kind:TK, text?:string) {
		if (typeof text !== 'undefined')
			return (kind == this.kind) && (this.text == text);
  	return (kind == this.kind)
	}

	public nextIs(kind:TK, text?:string) {
		this.getNext();
		return this.is(kind,text);
	}

  public peekNextIs(kind:TK, text?:string) {
		this.peekNext();
		return this.is(kind,text);
	}



}
