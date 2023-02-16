/**
 * takes the path from a vscode.Uri and removes the forward slash on Windows.
 * ex, /C:/mydir/myfile.txt becomes C:/mydir/myfile.txt
 */

// import { platform } from 'os';
// export function fixUriPath(path:string) {
//   if (platform == "win32")
// }

import * as vscode from 'vscode';
import * as ss from './systemSupport';
import ts from 'typescript';
import strip from 'strip-comments';
import { docs } from '../document';
import * as ns from './nodeSupport';


export function getWorkspaceFolders():string[] {
  let result:string[] = [];
  if (vscode.workspace.workspaceFolders)
    for (let wsFolder of vscode.workspace.workspaceFolders)
      result.push( ss.addPathEndSlash(ss.forwardSlashes(wsFolder.uri.fsPath)) );
  return result;
}

/**
 * returns an array of completion items based on some code you pass in.  The code is split between starting code and ending code.
 * The place between the two code snippets is where the completion call will be made (ie. where the cursor would be when a the visual
 * completion was activated in the editor). For example, to get the list of symbols offered by the process module, call this:
 * await getCompletions( 'import {' , '} from "process";' );
 */
export async function getCompletions(startCode: string, endCode:string, tempInsertPos:number) {
  let code = startCode + endCode;
  let completionPosition = docs.active!.posToPosition(tempInsertPos);
  completionPosition = new vscode.Position(completionPosition.line,completionPosition.character + startCode.length);

  let completionList: vscode.CompletionList<vscode.CompletionItem>;
  let wasDirty = docs.active!.vscodeDocument!.isDirty;
  docs.active!.insertText(tempInsertPos, code, undefined, false);
  try {
    completionList = (await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', docs.active!.uri, completionPosition)) as vscode.CompletionList;
  } finally {
    // It would be better if we could simply undo the change, but I see no way to send an undo command to a particular URI,
    // so we have to use revert in order to prevent a non dirty file from becoming dirty as a result of calling this function
    if (wasDirty) {
      docs.active!.insertText(tempInsertPos, '', tempInsertPos+code.length, false);
    } else
      await vscode.commands.executeCommand('workbench.action.files.revert',docs.active!.uri);
  }
  return completionList.items;
}

/**
 * returns the root folder in the workspace that the path belongs to.
 * @param path
 */
export function getRootWorkspaceFolder(path:string):string {
  let result = '';
  let folders = getWorkspaceFolders();
  for (let folder of folders)
    if (ss.startsWith(path, folder)) {
      result = folder
      break;
    }
  if (result == '')
    throw new Error('getRootWorkspaceFolder: path "'+path+'" not found in workspace');
  return result;
}

/**
 * takes a full path and returns the relative path from the root of the workspace.
 * for example:
 *   if you have these workspace folders:
 * ```
 *     /myCode/commonLibrary/
 *     /myCode/myProject/
 * ```
 *   when @param path is `"/myCode/commonLibrary/nodeOS/"`, the function returns `"nodeOS/"`
 *   when @param path is `"/myCode/myProject/"`, the function returns `""`
 */
export function getWorkspaceRelativePath(path:string):string {
  for (let folderPath of getWorkspaceFolders()) {
    if (ss.startsWith(path, folderPath))
      return ss.internalizePath(path.substr(folderPath.length));
  }
  return ss.internalizePath(path);
}

export function isWorkspaceRoot(path:string):boolean {
  if (!vscode.workspace.workspaceFolders)
    return false;
  return ss.containsText(getWorkspaceFolders(),path);
}

class VSCodeGlobals {
  public isExtensionActive:boolean = false;
  public workspaceStorage: vscode.Memento | null = null;
  public globalStorage: vscode.Memento | null = null;
  /**
   * this must get assigned in the activate(context) event.  The `context.extensionPath` parameter will contain the value needed for this.
   */
  public extensionEntryPointPath: string = '';
}


export class ParseConfigHost implements ts.ParseConfigHost {
  public get useCaseSensitiveFileNames() {
    return false;
  }

  public fileExists(fileName: string): boolean {
    return ts.sys.fileExists(fileName);
  }

  public readFile(path: string): string | undefined {
    return ts.sys.readFile(path);
  }

  public readDirectory(path: string, extensions: string[], excludes: string[], includes: string[], depth: number): string[] {
    return ts.sys.readDirectory(path,extensions,excludes,includes,depth);
  }
}

export function isDocumentOpen(file:string):boolean {
  for (let doc of vscode.workspace.textDocuments)
    if (ss.sameText(ss.internalizeFile(doc.fileName),file))
      return true;
  return false;
}

export function showTextDocument(file:string, position?:vscode.Position, viewColumn:vscode.ViewColumn = vscode.ViewColumn.Active ) {
  let options: vscode.TextDocumentShowOptions | undefined;
  if (position != null && !isDocumentOpen(file))
    options = {
      viewColumn,
      selection: new vscode.Selection(position, position)
    };
  else
    options = { viewColumn };

  vscode.window.showTextDocument(vscode.Uri.file(file),options);
}

/**
 * the location of a character in a multi-line string.  The position is considered to be a 0 based index.
 * Also, both `line` and `column` are 0 based.
 */
export class Location {
  constructor(
    /** a 0 based index of a character in a string */
    public position:number = 0,
    /** a 0 based line number in a string */
    public line:number = 1,
    /** a 0 based column number in a string */
    public column:number = 1
  ) {
  }
}

export function codiconsToHTML(stringWithCodicons:string) {
  let matches = stringWithCodicons.matchAll(/\$\((\S+)\)/mg);
  let result = '';
  let p = 0;
  for (let match of matches) {
    result += ss.sh(stringWithCodicons.substring(p,(match.index ?? 0)));
    result += '<i class="codicon codicon-'+match[1]+'"></i>';
    p = (match.index ?? 0) + match[0].length;
  }
  result += ss.sh(stringWithCodicons.substr(p));
  return result;
}

export function removeCodicons(stringWithCodicons:string) {
  let matches = stringWithCodicons.matchAll(/\$\((\S+)\)/mg);
  let result = '';
  let p = 0;
  for (let match of matches) {
    result += stringWithCodicons.substring(p,(match.index ?? 0));
    p = (match.index ?? 0) + match[0].length;
  }
  result += stringWithCodicons.substr(p);
  return result;
}

/**
 * vscode's UserData path can be in many places:
 * 1) look in the vscode executable's folder for `data/user-data/` (this will be the location for the portable vscode)
 * 2) check vscode command line for `--user-data-dir <path>` parameter   <-- this can't be done, so we can't support this...
 * 3) check platform specific location:
 *    Windows: %APPDATA%/Roaming/Code/
 *    Mac: $HOME/Library/Application Support/Code/
 *    Linux: $HOME/.config/Code/
 */
export async function getUserDataPath():Promise<string> {
  let path = ss.extractPath( process.execPath ) + 'data/user-data/';
  if (await ns.pathExists(path))
    return path;

  if (process.platform == 'win32') {
    path = ss.internalizePath(process.env.APPDATA!) + 'Code/';
  } else if (process.platform == 'darwin') {
    path = ss.internalizePath(process.env.HOME!) + 'Library/Application Support/Code/';
  } else {
    path = ss.internalizePath(process.env.HOME!) + '.config/Code/';
  }
  if (await ns.pathExists(path))
    return path;
  return '';
}

export async function getKeyBinding(command:string):Promise<string> {
  let keyBindingFile = await getUserDataPath() + 'User/keybindings.json';
  if (await ns.fileExists(keyBindingFile)) {
    let keyBindingsJson = strip( (await ns.readStringFromFile(keyBindingFile)) );
    let keyBindings:any[] = JSON.parse(keyBindingsJson);
    for (let binding of keyBindings) {
      if ((binding.command ?? '') == command)
        return binding.key;
    }
  }

  // package.json is in the parent of the extensionEntryPointPath
  let packageJsonFile = ss.extractPath(globals.extensionEntryPointPath) + 'package.json';
  if ( await ns.fileExists(packageJsonFile) ) {
    let packageObj:any = JSON.parse( (await ns.readStringFromFile( packageJsonFile )) );
    let keyBindings:any[] = packageObj.contributes.keybindings;
    for (let binding of keyBindings) {
      if ((binding.command ?? '') == command)
        if (process.platform == 'darwin')
          return (binding.mac ?? binding.key);
        else
          return binding.key;
    }
  }

  return '';
}

export function keyToDisplayText(key:string):string {
  if (process.platform == 'darwin') {
    key = key.replace(/ctrl/i,'^');
    key = key.replace(/shift/i,'⇧');
    key = key.replace(/cmd/i,'⌘');
    key = key.replace(/alt/i,'⌥');
    key = key.replace(/opt/i,'⌥');
    key = key.replace(/\+/g,'');
  }
  return key.replace(/\b\w/g, letter => letter.toUpperCase());
}


export let globals = new VSCodeGlobals();
