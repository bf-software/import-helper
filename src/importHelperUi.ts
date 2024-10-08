import * as vscode from 'vscode';
import { ImportHelperApi, MessageStyle } from './importHelperApi';
import * as ss from './common/systemSupport';
import { cAppName, Identifier } from './appSupport';
import { PlainQuickPick, PlainQuickPickButtons, PlainQuickPickItem } from './plainQuickPick';
import { docs } from './document';
import { globals } from './common/vscodeSupport';
import * as vs from './common/vscodeSupport';
import * as qpi from './quickPickItems';
import { ProjectFileDetails } from './projectModuleResolver';


export enum IHMode {addImport, openModule, showReferences}

interface ProjectFileQuickPickItem {
  projectFile: string;
  projectFileDetails:ProjectFileDetails;
  label: string;
  description?: string;
}

export class ImportHelperUi {
  private api = new ImportHelperApi();
  private moduleQuickPick: PlainQuickPick<qpi.ProjectModuleQuickPickItem|qpi.SeparatorItem> | undefined;
  private symbolQuickPick: PlainQuickPick<qpi.ProjectModuleQuickPickItem|qpi.SeparatorItem> | undefined;
  private openModuleKey: string = '';
  private showReferencesKey: string = '';
  private lastModuleSearchValue: string = '';
  private lastModuleSearchQpi: PlainQuickPickItem | undefined;
  private isFreshModuleSearch: boolean = false;
  private editorSearchIdentifier: Identifier | undefined;

  constructor() {

  }

  public async init() {
    try {
      this.openModuleKey = vs.keyToDisplayText(await vs.getKeyBinding('import-helper.openModule'));
      this.showReferencesKey = vs.keyToDisplayText(await vs.getKeyBinding('import-helper.showReferences'));
    } catch (e) {
      console.log('ImportHelperUi.init(): ' + ((e as Error).message ?? '') );
    }

    this.api.onGetSpecificFileChoice.do( async (projectFiles)=> {
      let selected = await vscode.window.showQuickPick<ProjectFileQuickPickItem>(
        projectFiles.map( (projectFileDetails, projectFile) => ({
          projectFile,
          projectFileDetails,
          label: projectFileDetails.relativeDisplayFile ?? '',
          description: ss.parens(projectFileDetails.locationInfo)
        })), {
          placeHolder: 'multiple files found, please select one to open'
        }
      );
      return selected?.projectFile ?? '';
    });

    this.api.onShowMessage.do(({msg,style})=>{
      if (style == MessageStyle.error)
        vscode.window.showErrorMessage(msg);
      else if (style == MessageStyle.warning)
        vscode.window.showWarningMessage(msg);
      else if (style == MessageStyle.info)
        vscode.window.showInformationMessage(msg);
    });


  }

  /**
   * main entry point for the three main commands: addImport, openModule, and showReferences
   */
  public async startQuickPick(mode: IHMode) {
    if (!docs.active) {
      vscode.commands.executeCommand('workbench.action.quickOpen');
      return;
    }
    this.disposeAllQuickPicks();

    this.api.mode = mode;
    this.api.importingModuleFilePath = ss.extractPath(docs.active.file ?? '');
    try {
      await this.api.initStartQuickPick({ onLoadingMilestone:(finalMilestone:boolean=false) => {
        if (! this.moduleQuickPick)
          return;
        if (this.moduleQuickPick!.value.length <= 1 && finalMilestone == false)  // <-- if *, or just 1 character is used, do not keep refreshing
          return;
        this.changedModuleValue(false,true);
      } });
    } catch(e: any) {
      if (e instanceof Error && ss.containsText(e.message, 'not found in workspace') ) {
        vscode.window.showInformationMessage(`Import Helper can only work with files in an open project.${mode == IHMode.openModule ? ` Opening vscode's quick open instead.` : ``}`);
        if (mode == IHMode.openModule)
          vscode.commands.executeCommand('workbench.action.quickOpen');
        return;
      }
      throw(e);
    }

    // at this point, the docs.actve.project is available to use because of the prior call to initRun()

    if (mode == IHMode.openModule) {
      // if this is not a ts or js project, then open vscode's "Go to file..." search
      if (!this.api.isProjectSupported) {
        vscode.commands.executeCommand('workbench.action.quickOpen');
        return;
      }
    } else if (mode == IHMode.addImport) {
      if (! docs.active?.isCode) {
        vscode.window.showInformationMessage('Import Helper can only add imports to code files.');
        return;
      }
    }

    let lastStep = 1;

    let selectedItem = await this.searchForModule(mode);
    this.moduleQuickPick?.hide();
    if (! selectedItem)
      return;
    this.lastModuleSearchValue = this.moduleQuickPick!.value;
    this.lastModuleSearchQpi = selectedItem;
    this.api.step1QPItem = selectedItem;


    // an item was selected, now do the next thing depending on the mode

    if (mode == IHMode.addImport) {
      // if the user picks an non import statement in step 1, move to step 2
      if (! (this.api.step1QPItem instanceof qpi.SourceModuleImportQuickPickItem || this.api.step1QPItem instanceof qpi.SourceSymbolImportQuickPickItem)) {
        lastStep = 2;
        this.api.step2QPItem = await this.searchForSymbol();
        this.symbolQuickPick?.hide();
        if (! this.api.step2QPItem)
          return;
      }
      await this.addImportStatement(lastStep);

    } else if (mode == IHMode.openModule) {
      this.api.openModule(this.api.step1QPItem);

    } else { // showReferences
      this.api.showReferences(this.api.step1QPItem);

    }

  }

   private disposeModuleQuickPick() {
     this.moduleQuickPick?.hide();
     this.moduleQuickPick?.dispose();
     this.moduleQuickPick = undefined;
   }

   private disposeSymbolQuickPick() {
     this.symbolQuickPick?.hide();
     this.symbolQuickPick?.dispose();
     this.symbolQuickPick = undefined;
   }

   private disposeAllQuickPicks() {
     this.disposeModuleQuickPick();
     this.disposeSymbolQuickPick();
   }

   public get isQuickPickVisible() {
     return (this.moduleQuickPick || this.symbolQuickPick);
   }

  public async searchForModule(mode:IHMode):Promise<qpi.ProjectModuleQuickPickItem | null> {
    return new Promise<qpi.ProjectModuleQuickPickItem | null>( resolve => {

      this.moduleQuickPick = new PlainQuickPick<qpi.ProjectModuleQuickPickItem>();

      qpi.settings.moduleItemButtons = this.getItemButtons(mode);

      this.moduleQuickPick.onDidHide(() => {
        this.disposeModuleQuickPick();
        resolve(null);
      });

      // this.moduleQuickPick.onDidChangeSelection(selection => {
      //   if (selection[0].isSelectable && !this.isFreshModuleSearch)
      //     resolve(selection[0]);
      // })

      this.moduleQuickPick.onDidAccept(() => {
        if (this.moduleQuickPick!.selectedItems[0].isSelectable)
          resolve(this.moduleQuickPick!.selectedItems[0] as qpi.ProjectModuleQuickPickItem);
      });

      this.moduleQuickPick.step = 1;
      let searchInfo = 'Separate terms with space. Use / to search paths. Use { for symbols.';
      if (mode == IHMode.addImport) {
        this.moduleQuickPick.totalSteps = 2;
        this.moduleQuickPick.title = 'Add Import - ' + cAppName;
        this.moduleQuickPick.placeholder = 'Search for module to import. '+searchInfo;
      } else if (mode == IHMode.openModule) {
        this.moduleQuickPick.totalSteps = 1;
        this.moduleQuickPick.title = 'Open Module - ' + cAppName;
        this.moduleQuickPick.placeholder = 'Search for module to open. '+searchInfo;
      } else if (mode == IHMode.showReferences) {
        this.moduleQuickPick.totalSteps = 1;
        this.moduleQuickPick.title = 'Show Module References - ' + cAppName;
        this.moduleQuickPick.placeholder = 'Search for module to show references. '+searchInfo;
      }

      this.isFreshModuleSearch = true;
      if (mode == IHMode.addImport) {
        this.editorSearchIdentifier = undefined;
        let searchText = this.api.getSelectedSearchText();
        if (searchText == '') {
          this.editorSearchIdentifier = this.api.getEditorSearchIdentifier();
          searchText = this.lastModuleSearchValue;
          if (this.editorSearchIdentifier) {
            searchText = this.editorSearchIdentifier.text;
            if (this.editorSearchIdentifier.isDefinitelyASymbol)
              searchText = '{'+searchText
            docs.active!.rememberPos('editorSearchIdentifier',this.editorSearchIdentifier.startPos);
          }
        }
        this.moduleQuickPick.value = searchText;
      } else {
        let searchText = this.api.getSelectedSearchText();
        if (searchText == '')
          searchText = this.lastModuleSearchValue;
        this.moduleQuickPick.value = searchText;
      }

      this.moduleQuickPick.onDidChangeValue(value => {
        this.changedModuleValue();
      })

      this.moduleQuickPick.buttons = this.getModuleSearchToolbarButtons();

      this.changedModuleValue();

      /* An odd side effect occurs when a quickpick is shown at the same time an intellisense popup is on the screen AND
         a change to the underlying module code is made. (IH adds a dummy import to the top of the module's code in order to
         trigger vscode's "get completions" command.)  As a result, the quickpick gets prematurely dismissed when intellisense
         popups are present.
      */
      vscode.commands.executeCommand('hideSuggestWidget').then(()=>{ // <-- hides any open intellisense popups before showing the quickpick
        this.moduleQuickPick?.show();
      });

    });

  }

  public getModuleSearchToolbarButtons():PlainQuickPickButtons {
    let buttons = new PlainQuickPickButtons();
    buttons.iconPath = globals.extensionEntryPointPath + 'images/Microsoft/';
    buttons.add('show all (*)', 'showAll.svg', () => {
      this.moduleQuickPick!.value = '*';
      this.changedModuleValue();
    });
    buttons.add('show all modules (\'*)', 'showAllModules.svg', () => {
      this.moduleQuickPick!.value = '\'*';
      this.changedModuleValue();
    });
    buttons.add('show all symbols ({*)', 'showAllSymbols.svg', () => {
      this.moduleQuickPick!.value = '{*';
      this.changedModuleValue();
    });
    buttons.add('show unused modules', 'showUnusedModules--codicon-references.svg', () => {
      this.api.showUnusedModules();
      this.disposeAllQuickPicks();
    });
    return buttons;
  }

  public getSymbolSearchToolbarButtons():PlainQuickPickButtons {
    let buttons = new PlainQuickPickButtons();
    buttons.iconPath = globals.extensionEntryPointPath + 'images/Microsoft/';
    buttons.add('interfaces', 'interface--codicon-symbol-interface.svg', () => {
      this.symbolQuickPick!.value = '/interface ';
      this.changedSymbolValue();
    });
    buttons.add('classes', 'class--codicon-symbol-class.svg', () => {
      this.symbolQuickPick!.value = '/class ';
      this.changedSymbolValue();
    });
    buttons.add('functions', 'function--codicon-symbol-method.svg', () => {
      this.symbolQuickPick!.value = '/function ';
      this.changedSymbolValue();
    });
    // buttons.add('constants', 'constant--codicon-symbol-constant.svg', () => {
    //   this.symbolQuickPick!.value = '/constant ';
    //   this.changedSymbolValue();
    // });
    buttons.add('variables/constants', 'variable--codicon-symbol-variable.svg', () => {
      this.symbolQuickPick!.value = '/variable ';
      this.changedSymbolValue();
    });
    buttons.add('enums', 'enum--codicon-symbol-enum.svg', () => {
      this.symbolQuickPick!.value = '/enum ';
      this.changedSymbolValue();
    });
    return buttons;

  }

  public getItemButtons(mode: IHMode):PlainQuickPickButtons {
    let buttons = new PlainQuickPickButtons();
    buttons.iconPath = globals.extensionEntryPointPath + 'images/Microsoft/';
    buttons.add('open module' + ss.infix(' (',this.openModuleKey,')'), 'openModule--codicon-folder-opened.svg', (item) => {
      if (item instanceof qpi.ProjectModuleQuickPickItem)
        this.api.openModule(item);
      this.disposeAllQuickPicks();
    });
    buttons.add('show all references' + ss.infix(' (',this.showReferencesKey,')'), 'showAllReferences--codicon-references.svg', (item) => {
      if (item instanceof qpi.ProjectModuleQuickPickItem)
        this.api.showReferences(item);
      this.disposeAllQuickPicks();
    });
    return buttons;
  }

	public openModuleKeyPressed() {
    // if we are already showing the quickpick with a highlighted item, open that item, or else open a new quickpick
    if (this.moduleQuickPick) {
      if (this.moduleQuickPick.activeItems[0])
        this.api.openModule(this.moduleQuickPick.activeItems[0] as qpi.ProjectModuleQuickPickItem);
    } else if (this.symbolQuickPick) {
      if (this.symbolQuickPick.activeItems[0])
        this.api.openModule(this.symbolQuickPick.activeItems[0] as qpi.ProjectModuleQuickPickItem);
    } else {
      this.startQuickPick(IHMode.openModule);
    }
	}

	public showReferenecesKeyPressed() {
    if (this.moduleQuickPick) {
      if (this.moduleQuickPick.activeItems[0] && this.moduleQuickPick.activeItems[0] instanceof qpi.ProjectModuleQuickPickItem)
        this.api.showReferences(this.moduleQuickPick.activeItems[0]);
    } else if (this.symbolQuickPick) {
      if (this.symbolQuickPick.activeItems[0] && this.symbolQuickPick.activeItems[0] instanceof qpi.ProjectModuleQuickPickItem)
        this.api.showReferences(this.symbolQuickPick.activeItems[0]);
    } else {
      this.startQuickPick(IHMode.showReferences);
    }
	}

  /**
   * called when IH's Module Search is opened, and every time the search string is changed in the
   * Module Search's QuickPick.
   *
   * This function's job is to calculate/recalculcate the list of QuickPickItems presented to the
   * user.  If it's a brand new search, it tries to position the initial item to the last one that
   * was selected during a prior search session. However, if it is not a brand new search and rather
   * was called in response to the user changing the search string, this will try to keep the
   * currently selected item selected after the new list of items is created. (ie. if the currently
   * selected item is still there.)
   */
  public changedModuleValue(selectTopItem:boolean = true, keepScrollPosition:boolean = false) {
    if (! this.moduleQuickPick)
      return;
    this.moduleQuickPick.keepScrollPosition = keepScrollPosition;
    let lastHighlightedQpi:qpi.ProjectModuleQuickPickItem | qpi.SeparatorItem | undefined = this.moduleQuickPick!.activeItems[0]; //<-- save this so we can re-highlight after search

    // do the actual search
    this.api.searchForModules(this.moduleQuickPick!.value);
    this.moduleQuickPick!.items = this.api.moduleSearchQuickPickItems;


    // begin code to highlight a particular item if possible
    let highlightThisQpi:qpi.ProjectModuleQuickPickItem | qpi.SeparatorItem | undefined;

    if (this.isFreshModuleSearch && !this.api.moduleSearchQuickPickItems.isLoading) {
      // position the active item at the one that was selected during a prior search session, if it's there
      if (this.lastModuleSearchQpi)
        highlightThisQpi = this.moduleQuickPick!.itemByQpi(this.lastModuleSearchQpi);
      this.isFreshModuleSearch = false;
    } else if (!selectTopItem) {
      // position the active item at the one that was last highlighted during this search session, if it's there
      if (lastHighlightedQpi)
        highlightThisQpi = this.moduleQuickPick!.itemByQpi(lastHighlightedQpi);
    }

    // position the current highlighted item
    if (highlightThisQpi)
      this.moduleQuickPick!.activeItems = [highlightThisQpi];

  }


  public async searchForSymbol():Promise<qpi.ProjectModuleQuickPickItem | undefined> {
    return new Promise<qpi.ProjectModuleQuickPickItem | undefined>( resolve => {

      // note: we can't reuse the QuickPick from findModule() because if we don't create a fresh one, the edit box won't pre-select the text (we want that so the user can start typing something new if they want)
      this.symbolQuickPick = new PlainQuickPick<qpi.ProjectModuleQuickPickItem>();

      this.symbolQuickPick.onDidHide(() => {
        this.disposeSymbolQuickPick();
        resolve(undefined);
      })

      this.symbolQuickPick!.onDidChangeSelection(selection => {
        if (selection[0].isSelectable)
          resolve(selection[0] as qpi.ProjectModuleQuickPickItem);
      })

      this.symbolQuickPick.buttons = this.getSymbolSearchToolbarButtons();

      this.symbolQuickPick.step = 2;
      this.symbolQuickPick.title = 'Select Symbol in '+ (this.api.step1QPItem as qpi.SourceModuleImportQuickPickItem).projectModule.shortenedModuleName + ' - ' + cAppName;
      this.symbolQuickPick.placeholder = 'Search for symbols. Use space to separate terms. Go to bottom for full import statements.';
      this.symbolQuickPick.value = this.api.startingSymbolSearchText;
      this.symbolQuickPick.show();

      this.symbolQuickPick.onDidChangeValue(value => {  // <-- assigned this event after `this.symbolQuickPick.value = ...`
        this.changedSymbolValue();
      })

      this.api.loadExportSymbols().then( () => {
        this.setSymbolItems();
      });

      this.setSymbolItems();

    });
  }

  public changedSymbolValue() {
    if (! this.symbolQuickPick)
      return;
    this.api.searchSymbols(this.symbolQuickPick.value);
    this.symbolQuickPick!.value = this.api.searchText;
    this.symbolQuickPick!.items = this.api.symbolSearchQuickPickItems;
  }

  public setSymbolItems() {
    this.api.searchSymbols(this.symbolQuickPick!.value);
    this.symbolQuickPick!.items = this.api.symbolSearchQuickPickItems;
  }

  public async addImportStatement(lastStep:number) {
    this.api.addImportStatement(lastStep, this.editorSearchIdentifier);
    if (this.api.addStatementWarning)
      vscode.window.showWarningMessage(this.api.addStatementWarning);
  }

  public goUpToImports() {
    this.api.goUpToImports();
  }

  public goBackDown() {
    this.api.goBackDown();
  }

  public pasteLastIdentifier() {
    this.api.pasteLastIdentifier();
  }


}
