import * as vscode from 'vscode';
import { ImportHelperApi, MessageStyle } from './importHelperApi';
import * as ss from './common/systemSupport';
import { cAppName } from './appSupport';
import { PlainQuickPick, PlainQuickPickButtons } from './plainQuickPick';
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
  private moduleQuickPick: PlainQuickPick<qpi.ProjectModuleQuickPickItem> | null = null;
  private symbolQuickPick: PlainQuickPick<qpi.ProjectModuleQuickPickItem> | null = null;
  private openModuleKey: string = '';
  private showReferencesKey: string = '';
  private lastModuleSearchValue: string = '';
  private lastModuleSearchItemIndex: number = 0;
  private isFreshModuleSearch: boolean = false;

  constructor() {

  }

  public async init() {
    this.openModuleKey = vs.keyToDisplayText(await vs.getKeyBinding('import-helper.openModule'));
    this.showReferencesKey = vs.keyToDisplayText(await vs.getKeyBinding('import-helper.showReferences'));

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
   * main entrypoint for the three main commands: addImport, openModule, and showReferences
   */
  public async startQuickPick(mode: IHMode) {
    if (!docs.active)
      return;
    this.disposeAllQuickPicks();

    this.api.mode = mode;
    this.api.importingModuleFilePath = ss.extractPath(docs.active.file ?? '');
    await this.api.initStartQuickPick({ onLoadingMilestone:() => {
      this.changedModuleValue();
    } });

    // starting here, the docs.actve.project is available to use because of the prior call to initRun()

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

    let selectedItem = await this.searchForModules(mode);
    this.moduleQuickPick?.hide();
    if (! selectedItem)
      return;
    this.lastModuleSearchValue = this.moduleQuickPick!.value;
    this.lastModuleSearchItemIndex = this.moduleQuickPick!.items.indexOf(selectedItem);
    this.api.step1QPItem = selectedItem;


    // an item was selected, now do the next thing depending on the mode

    if (mode == IHMode.addImport) {
      // if the user picks an non import statement in step 1, move to step 2
      if (! (this.api.step1QPItem instanceof qpi.SourceModuleImportQuickPickItem || this.api.step1QPItem instanceof qpi.SourceSymbolImportQuickPickItem)) {
        lastStep = 2;
        this.api.step2QPItem = await this.searchSymbol();
        this.symbolQuickPick?.hide();
        if (! this.api.step2QPItem)
          return;
      }
      await this.addImportStatement(lastStep);

    } else if (mode == IHMode.openModule) {
      this.api.openModule(this.api.step1QPItem);

    } else /*showReferences*/ {
      this.api.showReferences(this.api.step1QPItem);

    }

  }

   private disposeModuleQuickPick() {
     this.moduleQuickPick?.hide();
     this.moduleQuickPick?.dispose();
     this.moduleQuickPick = null;
   }

   private disposeSymbolQuickPick() {
     this.symbolQuickPick?.hide();
     this.symbolQuickPick?.dispose();
     this.symbolQuickPick = null;
   }

   private disposeAllQuickPicks() {
     this.disposeModuleQuickPick();
     this.disposeSymbolQuickPick();
   }

   public get isQuickPickVisible() {
     return (this.moduleQuickPick || this.symbolQuickPick);
   }

  public async searchForModules(mode:IHMode):Promise<qpi.ProjectModuleQuickPickItem | null> {
    return new Promise<qpi.ProjectModuleQuickPickItem | null>( resolve => {

      this.moduleQuickPick = new PlainQuickPick<qpi.ProjectModuleQuickPickItem>();
      // note: this is an example of changing the toolbar buttons in reponse to the active item changing
      // this.quickPickDisposables.push(
      //   this.quickPick.onDidChangeActive( () => {
      //     if (this.quickPick!.activeItems[0] instanceof ImportStatementQuickPickItem)
      //       this.quickPick!.buttons = [{iconPath:new vscode.ThemeIcon('location'), tooltip:'Locate modules using the selected import.'}];
      //     else
      //       this.quickPick!.buttons = [];
      //   })
      // )

      this.moduleQuickPick.onDidHide(() => {
        this.disposeModuleQuickPick();
        resolve(null);
      })

      // this.moduleQuickPick.onDidChangeSelection(selection => {
      //   if (selection[0].isSelectable && !this.isFreshModuleSearch)
      //     resolve(selection[0]);
      // })

      this.moduleQuickPick.onDidAccept(() => {
        if (this.moduleQuickPick!.selectedItems[0].isSelectable)
          resolve(this.moduleQuickPick!.selectedItems[0]);
      })

      this.moduleQuickPick.step = 1;
      let searchInfo = 'Separate terms with space. Use / to search paths. Use { for symbols.';
      if (mode == IHMode.addImport) {
        this.moduleQuickPick.totalSteps = 2;
        this.moduleQuickPick.title = 'Add Import - ' + cAppName;
        this.moduleQuickPick.placeholder = 'Search for modules to import. '+searchInfo;
      } else if (mode == IHMode.openModule) {
        this.moduleQuickPick.totalSteps = 1;
        this.moduleQuickPick.title = 'Open Module - ' + cAppName;
        this.moduleQuickPick.placeholder = 'Search for modules to open. '+searchInfo;
      } else if (mode == IHMode.showReferences) {
        this.moduleQuickPick.totalSteps = 1;
        this.moduleQuickPick.title = 'Show Module References - ' + cAppName;
        this.moduleQuickPick.placeholder = 'Search for modules to show references. '+searchInfo;
      }

      this.isFreshModuleSearch = true;
      this.moduleQuickPick.value = this.lastModuleSearchValue;

      this.moduleQuickPick.onDidChangeValue(value => {
        this.changedModuleValue();
      })

      this.moduleQuickPick.buttons = this.getButtons(mode);

      this.changedModuleValue();

      this.moduleQuickPick.show();

    });

  }

  public getButtons(mode: IHMode):PlainQuickPickButtons {
    let buttons = new PlainQuickPickButtons();
    buttons.iconPath = globals.extensionPath + 'out-bundle/images/Microsoft/';
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
    buttons.add('open module' + ss.infix(' (',this.openModuleKey,')'), 'openModule--codicon-folder-opened.svg', () => {
      if (this.moduleQuickPick?.activeItems[0]) {
        this.api.openModule(this.moduleQuickPick.activeItems[0]);
        this.disposeAllQuickPicks();
      }
    });
    buttons.add('show all references' + ss.infix(' (',this.showReferencesKey,')'), 'showAllReferences--codicon-references.svg', () => {
      if (this.moduleQuickPick?.activeItems[0]) {
        this.api.showReferences(this.moduleQuickPick.activeItems[0]);
        this.disposeAllQuickPicks();
      }
    });
    buttons.add('show unused modules', 'showUnusedModules--codicon-references.svg', () => {
      this.api.showUnusedModules();
      this.disposeAllQuickPicks();
    });
    return buttons;
  }

	public openModuleKeyPressed() {
    // if we are already showing the quickpick with a highlighted item, open that item, or else open a new quickpick
    if (this.moduleQuickPick) {
      if (this.moduleQuickPick.activeItems[0])
        this.api.openModule(this.moduleQuickPick.activeItems[0]);
    } else {
      this.startQuickPick(IHMode.openModule);
    }
	}

	public showReferenecesKeyPressed() {
    if (this.moduleQuickPick) {
      if (this.moduleQuickPick.activeItems[0])
        this.api.showReferences(this.moduleQuickPick.activeItems[0]);
    } else {
      this.startQuickPick(IHMode.showReferences);
    }
	}

  public changedModuleValue() {
    if (! this.moduleQuickPick)
      return;
    this.api.searchForModules(this.moduleQuickPick!.value);
    this.moduleQuickPick!.items = this.api.moduleSearchQuickPickItems;

    // position the active item to the one that was selected last time
    if (this.isFreshModuleSearch && !this.api.moduleSearchQuickPickItems.isLoading) {
      if (this.lastModuleSearchItemIndex < this.moduleQuickPick!.items.length)
        this.moduleQuickPick!.activeItems = [this.moduleQuickPick!.items[this.lastModuleSearchItemIndex]];
      this.isFreshModuleSearch = false;
    }
  }


  public async searchSymbol():Promise<qpi.ProjectModuleQuickPickItem | undefined> {
    return new Promise<qpi.ProjectModuleQuickPickItem | undefined>( resolve => {

      // note: we can't reuse the QuickPick from findModule() because if we don't create a fresh one, the edit box won't pre-select the text (we want that so the user can start typing something new if they want)
      this.symbolQuickPick = new PlainQuickPick<qpi.ProjectModuleQuickPickItem>();

      this.symbolQuickPick.onDidHide(() => {
        this.disposeSymbolQuickPick();
        resolve(undefined);
      })

      this.symbolQuickPick!.onDidChangeSelection(selection => {
        if (selection[0].isSelectable)
          resolve(selection[0]);
      })

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
    this.api.addImportStatement(lastStep);
    if (this.api.addStatementWarning)
      vscode.window.showWarningMessage(this.api.addStatementWarning);
  }

  public goUpToImports() {
    this.api.goUpToImports();
  }

  public goBackDown() {
    this.api.goBackDown();
  }


}



