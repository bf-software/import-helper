/**
	 * search strings:
	 * - multiple search terms are separated by spaces
	 * - there are 3 types of terms:
	 *     1. *file path substring* - if a term begins with a forward slash, it matches text in the path. For
	 *        example, `/stem` matches `/system/action` but not `/common/systemSupport`.
	 *     2. *file name substring* - text without a slash matches the file name. For example: `sys` matches
	 *        `/common/systemSupport`, but not `/system/action`
	 *     3. *imported symbol* - terms beginning with a `{` match a symbol that's been imported at least once
	 *        somewhere in the project. For example: `{rea` matches import {react} from 'react';
	 *
	 * if file name term contains a slash in the middle of it, it will split the term at the slash, where
	 * the first part searches in file name, and the second part searches paths.  for example: `supp/comm` = `supp /comm`
	 *
	 * if there is only 1 search term and it's 1 character long, the search will only match on the first letter of file
	 * names and folder names. for example: `a` will match `common/action`, but not `common/table`, and
	 * for paths, `/a` will match `/active/test` but not `/background/action`.  This is to help reduce the number of
	 * items returned on such a small search.
	 *
	 * finally, if a search term begins with a double quote (") it returns exact matches. examples:
	 *   `"action` matches `/system/action, but not `/system/actionList`
	 *   `/"common` matches `/proj/common/support`, but not '/proj/commonTools/support'
	 *   '{"react`  matches `{react}`, but not `{reactTools}`
	 */

import * as vscode from 'vscode';
import * as ss from './common/systemSupport';
import { docs } from './document';
import { ImportSymbol, ImportStatement, ImportKind } from './importStatementParser';
import { cLastImportPos, cGoToImportsBodyPos } from './appSupport';
import { globals, getWorkspaceRelativePath } from './common/vscodeSupport';
import { SourceModule, NodeModules, NodeModule, SourceModuleImport, SourceSymbolImport } from './projectModule';
import { projects } from './project';
import * as as from './appSupport';
import { sh } from './common/systemSupport';
import * as vs from './common/vscodeSupport';
import { IHMode } from './importHelperUi';
import { QuickViewPanel } from './quickViewPanel';
import * as cs from './common/collectionSupport';
import * as qpi from './quickPickItems';
import { ModuleSymbol, ModuleSymbols } from './moduleSymbol';
import { ModuleSearchTerms, SymbolSearchTerms, MTT, STT } from './searchTerms';
import { PlainQuickPickItem } from './plainQuickPick';
import { ProjectModuleResolver, ProjectFileMap } from './projectModuleResolver';
import { Identifier } from './appSupport';
import { ReferenceCountQuickPickItem } from './quickPickItems';
import { Event } from './common/eventSupport';
import { ImportSection, Module } from './moduleParser';

export const cReferenceCountSortWeight = 70;
export const cTargetLengthSortWeight = 30;

export enum MessageStyle {error, warning, info};


class ModuleSection {
  public startPos:number = 0;
  public endPos:number = 0;
  public goToPos: number = 0;
  public shouldSkip: boolean = false;
  public isBodySection:boolean = false;
  public get isImportSection() {
    return !this.isBodySection;
  }
}

class ModuleSections {
  private sections:ModuleSection[] = [];
  private currentIndex:number = 0;
  constructor(public module:Module) {
    if (!docs.active)
		  return;

    for (let i = 0; i < module.importSections.length; i++) {
      let importSection = module.importSections[i];
      let nextImportSection = module.importSections[i+1];

      // imports
      let moduleSection = new ModuleSection();
      moduleSection.isBodySection = false;
      moduleSection.shouldSkip = false;
      moduleSection.startPos = (i == 0 ? 0 : importSection.parseStartLocation.position);
      moduleSection.endPos = importSection.importsEndPos;
      if (docs.active.hasPos(cLastImportPos) && ss.isBetween(docs.active.getPos(cLastImportPos)!,moduleSection.startPos,moduleSection.endPos))
        moduleSection.goToPos = docs.active.getPos(cLastImportPos)!;
      else
        moduleSection.goToPos = importSection.importsStartPos;
      this.sections.push(moduleSection);
      if (ss.isBetween(module.currentCursorPos,moduleSection.startPos,moduleSection.endPos))
        this.currentIndex = this.sections.length-1;

      // body
      moduleSection = new ModuleSection();
      moduleSection.isBodySection = true;
      moduleSection.shouldSkip = true;
      moduleSection.startPos = importSection.importsEndPos+1;
      moduleSection.endPos = (nextImportSection ? nextImportSection.parseStartLocation.position-1 : module.sourceCode.length-1);
      if (docs.active.hasPos(cGoToImportsBodyPos) && ss.isBetween(docs.active.getPos(cGoToImportsBodyPos)!,moduleSection.startPos,moduleSection.endPos)) {
        moduleSection.shouldSkip = false;
        moduleSection.goToPos = docs.active.getPos(cGoToImportsBodyPos)!;
      } else
        moduleSection.goToPos = moduleSection.startPos;
      this.sections.push(moduleSection);
      if (ss.isBetween(module.currentCursorPos,moduleSection.startPos,moduleSection.endPos))
        this.currentIndex = this.sections.length-1;
    }
  }

  public get currentSection():ModuleSection {
    return this.sections[this.currentIndex];
  };

  public get nextSection():ModuleSection | undefined {
    return this.getAdjacentSection(1);
  };

  public get priorSection():ModuleSection | undefined {
    return this.getAdjacentSection(-1);
  };

  public getAdjacentSection(direction:number):ModuleSection | undefined {
    if (!docs.active)
		  return;
    let section = this.sections[this.currentIndex + direction];
    if (section) {
      if (section.shouldSkip)
        return this.sections[this.currentIndex + (direction * 2)];
      return section;
    }
  }
}



export class ImportHelperApi {

  /**
	 * these are the node_modules that vscode believes the project has access to. This gets loaded fresh by querying the
	 * vscode api every time the module search is invoked in case the user ever installs or removes modules via npm.
	 */
	private currentFileNodeModules = new NodeModules();

	public moduleSearchQuickPickItems = new qpi.ModuleSearchQuickPickItems();
  public symbolSearchQuickPickItems = new qpi.SymbolSearchQuickPickItems();
	public searchText:string = '';
	public importingModuleFilePath:string = '';
	public step1QPItem:qpi.ProjectModuleQuickPickItem | undefined;
	public step2QPItem:qpi.ProjectModuleQuickPickItem | undefined;
  public addStatementWarning: string = '';
	public exportSymbols = new ModuleSymbols();
	public startingSymbolSearchText:string = '';
	public mode:IHMode = IHMode.addImport;
	public onGetSpecificFileChoice = new Event<ProjectFileMap,string>();
  public onShowMessage = new Event<{msg:string, style:MessageStyle}>();
  public lastImportedIdentifier: string = '';

  public get isProjectSupported():boolean {
    if (!docs.active)
		  return false;
		docs.active.syncEditor();
		return Boolean(docs.active?.project);
  }

  /**
   * this should get called before running any api call that uses the project
   */
  private async prepareEditorAndProject(options?:{onLoadingMilestone:()=>void}) {
    if (!docs.active)
		  return;

    // must always syncEditor before calling the main functions of the active document
    docs.active.syncEditor();

    // makes sure the correct project is active for the current file
    await docs.active.syncProject( options?.onLoadingMilestone ?? (()=>{}) );

		// need to parse the module to figure out where the imports are
		await docs.active.parseModule();
  }

	public async initStartQuickPick( options:{onLoadingMilestone:(finalMilestone?:boolean)=>void} ) {
    if (!docs.active)
		  return;

    await this.prepareEditorAndProject(options);

    this.currentFileNodeModules.project = docs.active.project;
    this.currentFileNodeModules.load(docs.active.module!.tempImportInsertPos, options.onLoadingMilestone );
	}

	public async openModule(item: qpi.ProjectModuleQuickPickItem) {
    item.setLastUsedDate();
    let resolver = new ProjectModuleResolver(docs.active!.project!);
    let files = await resolver.getProjectFiles(docs.active!.project!.projectPath+'dummy.ts',item.importStatement.universalPathModuleSpecifier, /*skip node modules = */ false);
    let fileToOpen = '';
    if (files.size == 0)
      this.onShowMessage.cue({msg:`Open Module: can't find "${vs.removeCodicons(item.label).trim()}"`, style:MessageStyle.info});
    else if (files.size == 1)
		  fileToOpen = files.first!.key;
    else
      fileToOpen = (await this.onGetSpecificFileChoice.cueAsync(files)) ?? '';
		if (fileToOpen != '')
		  vscode.window.showTextDocument(vscode.Uri.file(fileToOpen));
	}

  public async showReferences(importedQpi: qpi.ProjectModuleQuickPickItem) {
		let importingQpis: qpi.SourceModuleQuickPickItemLocation[] = [];
		let importingModules: cs.FfDualKeyMapFoundKey1_key2Map<SourceModule, vs.Location> | undefined;

    importedQpi.setLastUsedDate();

    if (importedQpi instanceof qpi.NodeModuleQuickPickItem) {
      // this node module is not a *project* node module, it's one that was loaded on the fly.  We need to use the project one.
      if (importedQpi.projectNodeModule) {
			  importingModules = docs.active?.project?.nodeModuleUsedBySourceModules.byKey1(importedQpi.projectNodeModule)?.key2Map!
      }
		}

    if (!importingModules) {
      if (
        importedQpi instanceof qpi.SourceModuleQuickPickItem &&
        (importingModules = docs.active?.project?.sourceModuleUsedBySourceModules.byKey1(importedQpi.projectModule)?.key2Map!)
      ) {}
      else if (
        importedQpi instanceof qpi.SourceModuleImportQuickPickItem &&
        (importingModules = docs.active?.project?.sourceModuleImportUsedBySourceModules.byKey1(importedQpi.projectModule)?.key2Map!)
      ) {}
      else if (
        importedQpi instanceof qpi.SourceSymbolImportQuickPickItem &&
        (importingModules = docs.active?.project?.sourceSymbolImportUsedBySourceModules.byKey1((importedQpi.projectModule as any) as SourceSymbolImport)?.key2Map!)
      ) {}
      else if (
        (importedQpi instanceof qpi.SymbolQuickPickItem) &&
        (importedQpi as qpi.SymbolQuickPickItem).exportSymbol.sourceSymbolImport &&
        (importingModules = docs.active?.project?.sourceSymbolImportUsedBySourceModules.byKey1( (importedQpi as qpi.SymbolQuickPickItem).exportSymbol.sourceSymbolImport! )?.key2Map!)
      ) {}
      else {
        this.onShowMessage.cue({msg:`Show All References: Project does not import "${vs.removeCodicons(importedQpi.label).trim()}"`, style:MessageStyle.info});
        return;
      }
    }

    for (let [importingModule, location] of importingModules) {
		  let importingQpi = new qpi.SourceModuleQuickPickItemLocation(docs.active!.module!, importingModule, location);
			importingQpi.render();
		  importingQpis.push(importingQpi);
		}

    qpi.normalSort(importingQpis);

		let htmlItems:string = '';
		for (let importingQpi of importingQpis)
			htmlItems += `
				<div class="item"
					data-line="${importingQpi.importLocation.line}"
					data-column="${importingQpi.importLocation.column}"
					data-moduleFile="${sh(importingQpi.projectModule.universalPathModuleSpecifier)}"
				>
					<span class="name">
						<i class="codicon codicon-${importingQpi.labelIcon}"></i> ${sh(importingQpi.labelText)}
					</span>
					<span class="path">
						${sh(importingQpi.description)}
					</span>
				</div>
			`;

		let quickViewPanel = new QuickViewPanel();
		quickViewPanel.tabText = 'Show All References';
		quickViewPanel.items = htmlItems;
		quickViewPanel.headerText = importingModules.size + ss.sp(importingModules.size, ' Module', ' Modules') +' Using:';
    quickViewPanel.headerText = ss.sp(importingModules.size, ' Module', ' Modules') + ' Using:';
		quickViewPanel.descriptionHtml = `<span class="name">${vs.codiconsToHTML(importedQpi.label)}</span> <span class="path">${sh(importedQpi.description)}</span>`;
    quickViewPanel.show();

  }

  public async showUnusedModules() {
		let unusedQpis: qpi.ProjectModuleQuickPickItem[] = [];

		// get unused project file modules
 		for (let [key,sourceModule] of docs.active!.project!.sourceModules) {
  	  if (sourceModule.usedByCount == 0 && !sourceModule.isTest) {
			  let sourceModuleQpi = new qpi.SourceModuleQuickPickItem(docs.active!.module!, sourceModule);
				sourceModuleQpi.render();
			  unusedQpis.push(sourceModuleQpi);
			}
	  }

    // get unused node_modules
    let nodeModuleQuickPickItems = this.getUnusedNodeModules();
 		for (let nodeModuleQpi of nodeModuleQuickPickItems) {
		  nodeModuleQpi.render();
		  unusedQpis.push(nodeModuleQpi);
	  }

    qpi.normalSort(unusedQpis);

		let htmlItems:string = '';
    for (let unusedQpi of unusedQpis) {
			htmlItems += `
				<div class="item"
					data-moduleFile="${sh(unusedQpi.projectModule.universalPathModuleSpecifier)}"
				>
					<span class="name">
						<i class="codicon codicon-${unusedQpi.labelIcon}"></i> ${sh(unusedQpi.labelText)}
					</span>
					<span class="path">
						${sh(unusedQpi.description)}
					</span>
				</div>
			`;
		}

		let quickViewPanel = new QuickViewPanel();
		quickViewPanel.tabText = 'Unused Modules';
		quickViewPanel.items = htmlItems;
		quickViewPanel.headerText = 'Unused Modules';
		quickViewPanel.css = `
		  div.note {
        font-size: 90%;
				font-style: italic;
				line-height: 1rem;
		    white-space: pre-wrap;
			}
		`;
		quickViewPanel.descriptionHtml = `<div class="note">note: ambient modules and entry points into your app will appear here as well.</div>`;
    quickViewPanel.show();

  }


  public async loadExportSymbols() {
		if (!this.step1QPItem)
		  return;
    await this.exportSymbols.load(docs.active!.module!.tempImportInsertPos, this.step1QPItem.importStatement.moduleSpecifier, this.step1QPItem.projectModule.universalPathShortenedModuleSpecifier);
  }

  /**
   * option 1: highlighted text
   *   any highlighted text that is on a single line, and when trimmed, containes no spaces, that will become the search text
   *
   * option 2: identifier near the cursor
   *
   *   when beginning a search, if the identifier under the cursor, or just to the left of the cursor
   *   seems like it's there because the user is currently trying to import something they've just
   *   typed, then use that identifier as the search text.  If the user ends up importing that
   *   identifier, it should automatically be completed in the editor if it was partially typed.
   *
   *   how this is done:
   *
   *   firstly, if the line was not recently edited, this returns undefined and intructs the caller to
   *   do nothing.
   *
   *   if the cursor is inside or to the right of an identifier, it is returned along with the
   *   starting position of the identifier.
   *
   *   Later, the caller will replace the identifier in the text editor if the imported identifier began with
   *   the identifier this returns (or vice versa: the imported identifier begins with the editor identifier).
   *
  */
  public getEditorSearchIdentifier(): Identifier | undefined {
    const cTimeoutSeconds = 30;
    if (!docs.active)
      return;

    if (docs.active.msecSinceLastChange > cTimeoutSeconds * 1000)
      return;
    docs.active?.syncEditor();
    let line = docs.active.getCursorLine();
	  let lastChangedLine = docs.active.lastChangedLine;
    if (line != lastChangedLine)
      return;

    return as.getSearchIdentifierNearCursor({
      sourceLine: docs.active.getCursorLineText(),
      sourceLineStartPos: docs.active.getCursorLineStartPos(),
      lineCursorPos: docs.active.cursorPosition.character
    });

  }

  public getSelectedSearchText() {
    if (!docs.active)
      return '';
    let text = docs.active.getSelectedText().trim();
    if (
      text == '' ||
      text.includes('\n') ||
      text.includes(' ') ||
      text.includes('\t')
    )
      return '';
    return text;
  }


  /**
	 * this is "step 1" of Import Helper. It populates the {@link ImportHelperApi.moduleSearchQuickPickItems} with entries matching the `searchString` found in the various {@link Project} collections.
	 * this gets called every time the value of the quickpick is changed by the user.
	 */
  public searchForModules(searchText:string) {
		this.searchText = searchText;

		// Empty search string returns nothing instead of all modules, which would be too many right off the bat.
		if (searchText == '') {
      this.moduleSearchQuickPickItems.clear();
      return;
		}

		// if still loading modules
		if (this.currentFileNodeModules.isLoading || docs.active!.project!.isDirty || docs.active!.project!.isLoading ) {
  	  this.moduleSearchQuickPickItems.isLoading = true;
			return;
		}

		this.moduleSearchQuickPickItems.clear();

    let moduleSearchTerms	= new ModuleSearchTerms();
		moduleSearchTerms.parseSearchText(searchText);

	  if (
		  moduleSearchTerms.hasType(MTT.any) ||
			moduleSearchTerms.hasType(MTT.all) ||
      moduleSearchTerms.hasType(MTT.symbol) ||
			moduleSearchTerms.hasType(MTT.allSymbols)
		)
		  this.moduleSearchQuickPickItems.push(...this.searchSourceSymbolImportsForModuleSearch(moduleSearchTerms) );

	  if (
      !moduleSearchTerms.hasType(MTT.symbol) &&
		  !moduleSearchTerms.hasType(MTT.allSymbols)
		) {
		  this.moduleSearchQuickPickItems.push(...this.searchSourceModuleImportsForModuleSearch(moduleSearchTerms) );
  		this.moduleSearchQuickPickItems.push(...this.searchSourceModulesForModuleSearch(moduleSearchTerms) );
 		  this.moduleSearchQuickPickItems.push(...this.searchNodeModulesForModuleSearch(moduleSearchTerms) );
		}

    qpi.normalSort(this.moduleSearchQuickPickItems as Array<ReferenceCountQuickPickItem>);

		if (
      moduleSearchTerms.maxTermLength > 1 &&
      (
        moduleSearchTerms.hasType(MTT.any) ||
        moduleSearchTerms.hasType(MTT.moduleName) ||
        moduleSearchTerms.hasType(MTT.symbol)
      )
    ) {
      qpi.weightedSort(this.moduleSearchQuickPickItems as Array<ReferenceCountQuickPickItem>);
      if (this.moduleSearchQuickPickItems.length)
        this.moduleSearchQuickPickItems.splice(0,0,new qpi.SeparatorItem('closest match/most used'));
    } else
      qpi.addModuleSearchSeparators(this.moduleSearchQuickPickItems);

    this.moduleSearchQuickPickItems.renderAll();
  }

  public searchSymbols(searchText:string) {
    this.searchText = searchText;

		// if still loading symbols
		if ( this.exportSymbols.isLoading ) {
			this.symbolSearchQuickPickItems.isLoading = true;
			return;
		}

		this.symbolSearchQuickPickItems.clear();

    let symbolSearchTerms	= new SymbolSearchTerms();
    symbolSearchTerms.parseSearchText(searchText);

    let recommended = this.recommendedSourceModuleImportsforSymbolSearch(symbolSearchTerms);
    if (recommended.length > 0) {
      this.symbolSearchQuickPickItems.push(new qpi.SeparatorItem(`full import${ss.spHide(recommended.length,'','s')} used elsewhere`));
      this.symbolSearchQuickPickItems.push(...recommended);
    }

    let symbols = this.searchSymbolsForSymbolSearch(symbolSearchTerms)
    if (symbols.length > 0) {
      this.symbolSearchQuickPickItems.push(new qpi.SeparatorItem(`importable symbol${ss.spHide(symbols.length,'','s')}`));

      // symbols start out as an alpha sort on name
      // normalSort() groups by symbol type -- which we'll only do when all symbols are shown
      if (symbolSearchTerms.length == 0)
        qpi.normalSort(symbols);

      this.symbolSearchQuickPickItems.push(...symbols);
    }

    if (symbolSearchTerms.length >= 2 || symbolSearchTerms.hasType(STT.symbolType)) {
      // the search terms are such that it doesn't make sense to offer full imports
    } else if (
      this.step1QPItem! instanceof qpi.SourceModuleQuickPickItem &&
      (!this.step1QPItem.projectModule.isCode || this.step1QPItem.projectModule.isSvelte) &&
      recommended.length >= 1 &&
      this.recommendedHasMainIdentifier(recommended,as.deriveModuleNameAlias(this.step1QPItem.importStatement.shortenedModuleName))
    ) {
      // this is non-code or a svelte module, so it would normally only recommend the generic full imports,
      // but in this case, the full imports were already recommended at the top, so we won't offer them again at the bottom.
    } else {
      recommended = this.recommendedModuleImportsForSymbolSearch(symbolSearchTerms)
      if (recommended.length > 0) {
        this.symbolSearchQuickPickItems.push(new qpi.SeparatorItem(`full import${ss.spHide(recommended.length,'','s')}`));
		    this.symbolSearchQuickPickItems.push(...recommended);
      }
    }

		this.symbolSearchQuickPickItems.renderAll();
  }

  public recommendedHasMainIdentifier(recommended: qpi.ProjectModuleQuickPickItem[], mainIdentifier: string):boolean {
    return Boolean( recommended.find( (item) => item.importStatement.mainIdentifier == mainIdentifier ) );
  }


  /**
   * adds an import statement to the/an import section.  For svelte, there may be multiple import
   * sections, so some additional processing is required. Follow these steps:
   *   1. determine if the import needs to happen at all: no import needed if any statement in any
   *      section already imports it.
   *   2. determine the import section that will receive the new import by looking at the cursor
   *      position, and selecting the nearest section above it.
   *   3. see if the import can be merged into any of the statements in the chosen section
   *   4. if not, add the import to the bottom of the chosen section
   */
  public async addImportStatement(fromStep:number, editorSearchIdentifier?:Identifier) {
		this.addStatementWarning = '';

    if (!docs.active)
		  return;

    let module = docs.active.module!;
    let selectedQPI = (fromStep == 1 ? this.step1QPItem : this.step2QPItem)!;
    selectedQPI.setLastUsedDate();

    this.lastImportedIdentifier = selectedQPI.importStatement.mainIdentifier;

    // first pass, check for importability.  Sometimes, we can't import, so we show a warning message and quit.
    let isWarning = false;
    module.eachImportStatement((statement) => {
			if (statement.isSameModuleAs(selectedQPI.importStatement)) {
        let mergeError = {message:''};
        statement.isMergable(selectedQPI.importStatement,mergeError);
        if (mergeError.message) {
          this.addStatementWarning = mergeError.message;
          isWarning = true;
          return false; /* break */
        }
			}
    });
    if (isWarning)
      return;

    // now, see if the statement can be merged into an existing statement in the selected section
		let existingStatement:ImportStatement | undefined;
    for (let statement of module.selectedImportSection.importStatements) {
    	if (statement.isSameModuleAs(selectedQPI.importStatement)) {
        if (statement.isMergable(selectedQPI.importStatement)) {
          existingStatement = statement;
          break;
        }
      }
    }

		if (existingStatement) {

      // copy the symbols into the existing statement
      if (selectedQPI.importStatement.hasSymbols) {
        existingStatement.bracesHavePadding = selectedQPI.importStatement.bracesHavePadding;
        existingStatement.commasHaveSpaces = selectedQPI.importStatement.commasHaveSpaces;
        existingStatement.symbols.append(selectedQPI.importStatement.symbols);
  		  if (existingStatement.symbols.appendWarning)
  			  this.addStatementWarning = existingStatement.symbols.appendWarning;
      }

      // copy the alias into the existing statement
      if (selectedQPI.importStatement.hasAlias) {
				existingStatement.importKind = selectedQPI.importStatement.importKind;
			  existingStatement.alias = selectedQPI.importStatement.alias;
			}

  		await docs.active.insertText(existingStatement.startLocation.position, existingStatement.asText(), existingStatement.endLocation.position+1);
		  docs.active.rememberPos(cLastImportPos, existingStatement.startLocation.position + existingStatement.cursorPosAfterAsText);

		} else {
			// add new statement
      let importSection = module.selectedImportSection;
			let text = '\n'.repeat(importSection.nextImportNewlinesBefore) + importSection.importIndentCharacters + selectedQPI.importStatement.asText();
  		let rememberPos = importSection.nextImportInsertPos + (docs.active.vscodeDocument!.eol * importSection.nextImportNewlinesBefore) + importSection.importIndentCharacters.length + selectedQPI.importStatement.cursorPosAfterAsText;
			await docs.active.insertText(importSection.nextImportInsertPos, text + '\n'.repeat(importSection.nextImportNewlinesAfter));
			docs.active.rememberPos(cLastImportPos, rememberPos);

		}

    // when inserting an import without symbols, jump the cursor to the place where the user can start entering symbols.
    if (selectedQPI.importStatement.hasSymbols && selectedQPI.importStatement.symbols.items.length == 0) {
      await this.goUpToImports();
		}


    // complete editor text
    if (editorSearchIdentifier) {
      let pos = docs.active.getPos('editorSearchIdentifier') ?? -1;
      if (pos > -1) {
        let mainIdentifier = selectedQPI.importStatement.mainIdentifier;
        if (mainIdentifier && mainIdentifier.startsWith(editorSearchIdentifier.text)) {

          let insertStartPos = pos;
          let insertEndPos = pos + editorSearchIdentifier.text.length;

          // sanity check
          let cursorPosLine = docs.active.cursorPosition.line;
          let insertStartPosLine = docs.active.posToPosition(insertStartPos).line;
          let insertEndPosLine = docs.active.posToPosition(insertEndPos).line;
          if (insertStartPosLine != cursorPosLine || insertEndPosLine != cursorPosLine)
            throw Error(`import-helper.addImportStatement(): sanity check: was about to replace text on a line different from the cursor's line`);

          await docs.active.insertText(insertStartPos,mainIdentifier,insertEndPos);
          docs.active.clearSelection(); // <-- insert text causes a selection to be created.

        }
      }

    }

	}

	private searchSourceModulesForModuleSearch(moduleSearchTerms:ModuleSearchTerms):qpi.SourceModuleQuickPickItem[] {
    let items = ss.transform<[string,SourceModule],qpi.SourceModuleQuickPickItem>(docs.active!.project!.sourceModules, ([key,sourceModule]) => {
		  let path = ss.extractPath(sourceModule.universalPathShortenedModuleSpecifier);
			if (moduleSearchTerms.termsMatch(sourceModule.moduleName, path)) {
				let sourceModuleQuickPickItem = new qpi.SourceModuleQuickPickItem(docs.active!.module!, sourceModule);
			  return sourceModuleQuickPickItem;
			}
		});
    return items;
	}

  /**
	 * if the user starts typing "/node_modules", this is set to return all of the node modules we know about
	 */
	private searchNodeModulesForModuleSearch(moduleSearchTerms:ModuleSearchTerms):qpi.NodeModuleQuickPickItem[] {
		let items = ss.transform<[string,NodeModule],qpi.NodeModuleQuickPickItem>(this.currentFileNodeModules, ([key,nodeModule]) => {
			let path = 'node_modules/' + nodeModule.universalPathModuleSpecifier;
			if (moduleSearchTerms.termsMatch(nodeModule.universalPathModuleSpecifier, path)) {
				let nodeModuleQuickPickItem = new qpi.NodeModuleQuickPickItem(docs.active!.module!, nodeModule);
  		  return nodeModuleQuickPickItem;
			}
		});
    return items;
	}

  /**
   * looks at the project.json depenencies and returns them if they aren't being imported in the project
   */
	private getUnusedNodeModules():qpi.NodeModuleQuickPickItem[] {
    let items:qpi.NodeModuleQuickPickItem[] = [];
    for (let [key,dependencyNodeModule] of docs.active!.project!.dependencyNodeModules) {
      let foundNodeModule = docs.active!.project!.nodeModules.byKey(dependencyNodeModule.universalPathShortenedModuleSpecifier);
      if (!foundNodeModule || foundNodeModule.value.usedByCount == 0)
        items.push(new qpi.NodeModuleQuickPickItem(docs.active!.module!, dependencyNodeModule));
    }
    return items;
	}

	private searchSourceModuleImportsForModuleSearch(moduleSearchTerms:ModuleSearchTerms):qpi.SourceModuleImportQuickPickItem[] {
		let items = ss.transform<[string,SourceModuleImport],qpi.SourceModuleImportQuickPickItem>(docs.active!.project!.sourceModuleImports, ([key, sourceModuleImport]) => {
		  let path = ss.extractPath(sourceModuleImport.universalPathShortenedModuleSpecifier);
			if (moduleSearchTerms.termsMatch(sourceModuleImport.aliasOrShortenedModuleName, path)) {
 			  let item = new qpi.SourceModuleImportQuickPickItem(docs.active!.module!, sourceModuleImport);
 		    return item;
  	  }
		})
		return items;
	};

	private searchSourceSymbolImportsForModuleSearch(moduleSearchTerms:ModuleSearchTerms):qpi.SourceSymbolImportQuickPickItem[] {
		let items = ss.transform<[string,SourceSymbolImport],qpi.SourceSymbolImportQuickPickItem>(docs.active!.project!.sourceSymbolImports, ([key,sourceSymbolImport]) => {
			let path = ss.extractPath(sourceSymbolImport.universalPathShortenedModuleSpecifier);
      if ( moduleSearchTerms.termsMatch(sourceSymbolImport.shortenedModuleName, path, sourceSymbolImport.name, sourceSymbolImport.alias ) ) {
 			  let importQuickPickItem = new qpi.SourceSymbolImportQuickPickItem(docs.active!.module!, sourceSymbolImport);
 		    return importQuickPickItem;
  	  }
		})
		return items;
	};

  public recommendedSourceModuleImportsforSymbolSearch(symbolSearchTerms:SymbolSearchTerms):qpi.ProjectModuleQuickPickItem[] {
		let items:qpi.SourceModuleImportQuickPickItem[] = [];
		if (symbolSearchTerms.length > 0)
		  return items;

		let universalPathShortenedModuleSpecifier = (this.step1QPItem as qpi.SourceModuleImportQuickPickItem).projectModule.universalPathShortenedModuleSpecifier;
    let sourceModuleImports = docs.active!.project!.sourceModuleImports.allByUniversalPathShortenedModuleSpecifier(universalPathShortenedModuleSpecifier);
		for (let sourceModuleImport of sourceModuleImports) {
			let item = new qpi.SourceModuleImportQuickPickItem(docs.active!.module!, sourceModuleImport);
			items.push(item);
		}

    qpi.normalSort(items);
    qpi.weightedSort(items);

		// if (items.length > 0)
		//   items[items.length-1].hasSeparatorLine = true;
		return items;
	}

	public searchSymbolsForSymbolSearch(symbolSearchTerms:SymbolSearchTerms):qpi.SymbolQuickPickItem[] {
    let items:qpi.SymbolQuickPickItem[] = [];
		if (!this.exportSymbols)
		  return items;

		for (let exportSymbol of this.exportSymbols) {
			if (symbolSearchTerms.termsMatch(exportSymbol.name, exportSymbol.alias, exportSymbol.type)) {
  		  let symbolQPI = new qpi.SymbolQuickPickItem(docs.active!.module!, this.step1QPItem!.projectModule, exportSymbol);
			  items.push(symbolQPI);
 	    }
		}
		return items;
	}

	public recommendedModuleImportsForSymbolSearch(symbolSearchTerms:SymbolSearchTerms):qpi.SourceModuleImportQuickPickItem[] {
		let items:qpi.SourceModuleImportQuickPickItem[] = [];
    let item: qpi.SourceModuleImportQuickPickItem;
    let tempSourceModuleImport = new SourceModuleImport(docs.active!.project!.sourceModuleImports);
    tempSourceModuleImport.universalPathModuleSpecifier = this.step1QPItem!.projectModule.universalPathModuleSpecifier;
    let isCodeOrNode = this.step1QPItem! instanceof qpi.NodeModuleQuickPickItem || this.step1QPItem!.projectModule.isCode;
    let isSvelte = this.step1QPItem?.projectModule.isSvelte;

		if (symbolSearchTerms.length == 0) {

			// add an option for a module only import
      if (!isSvelte) {
        item = new qpi.SourceModuleImportQuickPickItem(docs.active!.module!, tempSourceModuleImport);
        item.importStatement.initNonScannedStatement();
        items.push(item);
      }

			// add an option for an empty set of symbols
      if (isCodeOrNode && !isSvelte) {
			  item = new qpi.SourceModuleImportQuickPickItem(docs.active!.module!, tempSourceModuleImport);
			  item.importStatement.hasSymbols = true;
			  items.push(item);
      }

			let nameAlias = as.deriveModuleNameAlias(tempSourceModuleImport.shortenedModuleName);

			// add an option for a default alias of the same name as the module
			item = new qpi.SourceModuleImportQuickPickItem(docs.active!.module!, tempSourceModuleImport);
			item.importStatement.initNonScannedStatement();
			item.importStatement.importKind = ImportKind.defaultAlias;
			item.importStatement.alias = nameAlias;
      if (isSvelte)
        item.importStatement.alias = ss.capitalize(item.importStatement.alias);
			items.push(item);

			// add an option for an all alias of the same name as the module
      if (isCodeOrNode && !isSvelte) {
        item = new qpi.SourceModuleImportQuickPickItem(docs.active!.module!, tempSourceModuleImport);
        item.importStatement.initNonScannedStatement();
        item.importStatement.importKind = ImportKind.allAlias;
        item.importStatement.alias = nameAlias;
        items.push(item);
      }

    } else {

			// add an option for a completely manual symbol based on the search text
      if (isCodeOrNode && !isSvelte) {
        item = new qpi.SourceModuleImportQuickPickItem(docs.active!.module!, tempSourceModuleImport);
        let importSymbol = new ImportSymbol();
        importSymbol.name = symbolSearchTerms.lastSearchText;
        item.importStatement.symbols.items.push(importSymbol);
        items.push(item);
      }

			// add an option for a default alias
			item = new qpi.SourceModuleImportQuickPickItem(docs.active!.module!, tempSourceModuleImport);
			item.importStatement.initNonScannedStatement();
			item.importStatement.importKind = ImportKind.defaultAlias;
			item.importStatement.alias = as.makeValidSymbolName(symbolSearchTerms.lastSearchText);
			items.push(item);

			// add an option for an all alias import
      if (isCodeOrNode && !isSvelte) {
  			item = new qpi.SourceModuleImportQuickPickItem(docs.active!.module!, tempSourceModuleImport);
			  item.importStatement.initNonScannedStatement();
			  item.importStatement.importKind = ImportKind.allAlias;
			  item.importStatement.alias = as.makeValidSymbolName(symbolSearchTerms.lastSearchText);
			  items.push(item);
      }

		}

    return items;

	}

  private getModuleSections():ModuleSections {
    return new ModuleSections(docs.active!.module!);
  }


  private async moveToAdjactentSection(direction:number) {
    if (!docs.active)
      return;
    await this.prepareEditorAndProject();
    let sections = this.getModuleSections();
    let section = sections.getAdjacentSection(direction);
    if (section) {
      if (sections.currentSection.isBodySection)
        docs.active.rememberPos(cGoToImportsBodyPos);
      docs.active.goTo(section.goToPos);
    }
  }


  public async goUpToImports() {
    await this.moveToAdjactentSection(-1);
  }

  public async goBackDown() {
    await this.moveToAdjactentSection(1);
  }


  public async pasteLastIdentifier() {
    if (!docs.active)
      return;
    if (this.lastImportedIdentifier == '')
      return;

    await docs.active.pasteText(this.lastImportedIdentifier);

  }

}
