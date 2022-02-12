/**
 * @module extensionEntryPoint - Import Helper
 *
 * The entry point for this extension.
 *
 *  #some basic rules
 *
 *  ##file system
 *  - "file name" means simply the name and any extensions, ex. `helloWorld.js`
 *  - "path" means all the path information, but not the file name '/home/joe/`.
 *  - all paths use forward slashes (even on windows)
 *  - all paths end with a forward slash
 *    - `/` means the root directory in linux
 *    - `c:/` means the root of the c drive in windows
 *    - `/home/user1/` refers to the `user1` directory
 *      (`/home/user1` -- without the ending `/` would refer to a *file* called "user1" in the home directory, *not* a directory called "user1")
 *  - all file extensions start with a dot
 *    - `let typescriptExt = '.ts'`, is correct, but not this: `let typescriptExt = 'ts';`
 *
 *  ###variable naming
 *  - variables containing a path and file name of a file should be called xxxxFile
 *    - as in `let sourceFile = '/myProject/main.ts';`
 *    - or for realtive paths: `let sourceFile = '../main.ts';`
 *
 *  - variables pointing to a folder/directory should be called xxxxPath (remember, all paths end with a '/')
 *    - as in `let sourcePath = '/myProject/';`
 *
 *  - variables containing just a file's name with extension (i.e. no path) should be called xxxxFileName
 *    - as in `let sourceFileName = 'main.ts';`
 *
 *  - variables containing just a file extension should be called xxxxExt
 *    - as in `let sourceExt = '.ts';`
 *
 * beyond this entrypont, this main code of this extension is found in:
 *  - {@link ./importHelperUi.ts}
 *  - {@link ./importHelperApi.ts}
 *
 * the data that this extension deals with can be found in the following modules:
 *  - {@link ./project.ts}
 *  - {@link ./projectModule.ts}
 *
 */
import * as vscode from 'vscode';
import { ImportHelperUi, IHMode } from './importHelperUi';
import * as fs from 'fs';
import { docs } from './document';
import * as vs from './common/vscodeSupport';
import * as plainQuickPick from './plainQuickPick';
import * as addImportAPI from './importHelperApi';
import * as ss from './common/systemSupport';
import * as as from './appSupport';
import { projects } from './project';

// globals for debugging
// (global as any).$vscode = vscode;
// (global as any).$plainQuickPick = plainQuickPick;
// (global as any).$addImportAPI = addImportAPI;
// (global as any).$ss = ss;
// (global as any).$docs = docs;
// (global as any).$globals = vs.globals;

let addImportUI = new ImportHelperUi();

export function activate(context: vscode.ExtensionContext) {

  vs.globals.workspaceStorage = context.workspaceState;
	vs.globals.globalStorage = context.globalState;
	vs.globals.extensionEntryPointPath = ss.internalizePath(context.extensionPath)+'out-bundle/';

  as.initConfiguration();
  addImportUI.init();

	context.subscriptions.push(

		vscode.commands.registerCommand('import-helper.addImport', () => {
			addImportUI.startQuickPick(IHMode.addImport);
		}),

		vscode.commands.registerCommand('import-helper.openModule', () => {
		 	addImportUI.openModuleKeyPressed();
		}),

		vscode.commands.registerCommand('import-helper.goToImports', () => {
		 	addImportUI.goUpToImports();
		}),

		vscode.commands.registerCommand('import-helper.goBackDown', () => {
		 	addImportUI.goBackDown();
		}),

		vscode.commands.registerCommand('import-helper.showReferences', () => {
		 	addImportUI.showReferenecesKeyPressed();
		}),


    vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
			docs.documentChanged(event);
		}),

    vscode.window.onDidChangeTextEditorSelection((event: vscode.TextEditorSelectionChangeEvent) => {
      docs.selectionChanged(event);
    }),

    vscode.workspace.onDidCloseTextDocument((vscodeTextDocument: vscode.TextDocument) => {
			docs.closeDocument(vscodeTextDocument);
		}),

    vscode.workspace.onDidDeleteFiles( (event: vscode.FileDeleteEvent) => {
      for (let uri of event.files) {
        let moduleFile = ss.internalizeFile(uri.fsPath);
        let modulePath = ss.extractPath(moduleFile);
        let foundProject = projects.byModulePath(modulePath);
        if (foundProject)
          foundProject.value.isDirty = true;
      }
    }),

    vscode.workspace.onDidRenameFiles( (event: vscode.FileRenameEvent) => {
      for (let uri of event.files) {
        let newModuleFile = ss.internalizeFile(uri.newUri.fsPath);
        let oldModuleFile = ss.internalizeFile(uri.oldUri.fsPath);
        let oldModulePath = ss.extractPath(oldModuleFile);
        let foundProject = projects.byModulePath(oldModulePath);
        if (foundProject)
          foundProject.value.moduleRenamed(oldModuleFile, newModuleFile);
      }
    }),

    vscode.workspace.onDidSaveTextDocument( (textDocument: vscode.TextDocument) => {
      let moduleFile = ss.internalizeFile(textDocument.uri.fsPath);
      let modulePath = ss.extractPath(moduleFile);
      let foundProject = projects.byModulePath(modulePath);
      if (foundProject)
        foundProject.value.moduleContentChanged(moduleFile);
    }),

    vscode.workspace.onDidChangeConfiguration( (event: vscode.ConfigurationChangeEvent) => {
      if (event.affectsConfiguration('import-helper')) {
        as.initConfiguration();
      }
    })

	);


  vs.globals.isExtensionActive = true;
}

export function deactivate() {
  vs.globals.isExtensionActive = false;
}

