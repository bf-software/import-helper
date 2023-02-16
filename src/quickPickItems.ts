import { PlainQuickPickItem, PlainQuickPickItems } from './plainQuickPick';
import { cReferenceCountSortWeight, cTargetLengthSortWeight } from './importHelperApi';
import { ImportStatement, ImportKind } from './importStatementParser';
import { ProjectModule, SourceModule, NodeModule, SourceModuleImport, SourceSymbolImport } from './projectModule';
import * as ss from './common/systemSupport';
import { ModuleSymbol } from './moduleSymbol';
import * as cs from './common/collectionSupport';
import * as as from './appSupport';
import { docs } from './document';
import * as vscode from 'vscode';
import * as vs from './common/vscodeSupport';
import { Module } from './moduleParser';


const cSGProjectImport = 1;
const cSGSourceModule = 2;
const cSGNodeModule = 3;
const cSGProjectSymbol = 4;


/**
 * the maximum number of seconds since the module was last used that is eligible for weighted sorting.  For example,
 * if this is set to 3600 (1 hour), then only modules that have been used within the last hour are given any extra
 * weight when sorting.  Modules used very recently, like only a few seconds ago, will have the highest weights, and
 * those that are near an hour old, will have the lowest. (Those older than an hour will have no extra weight.)
 */
const cMaxSecondsSortWeight = 60 * 60; // 1 hour

let moduleItemButtons: vscode.QuickInputButton[] = [];
export let settings = { moduleItemButtons };

export function normalSort(items:Array<ReferenceCountQuickPickItem>) {
	items.sort( (a,b) => {
		if (a.sortGroup == b.sortGroup)
		  return a.sortText.localeCompare(b.sortText);
		else
			return a.sortGroup.localeCompare(b.sortGroup);
  });
}

export function weightedSort(items:Array<ReferenceCountQuickPickItem>) {
  let ws = new cs.WeightedSort<ReferenceCountQuickPickItem>();
	let directCriteran    = ws.addCriterian(45, (item) => item.directReferenceCount,      {name:'direct'});
	let indirectCriterian = ws.addCriterian(15, (item) => item.indirectReferenceCount,    {name:'indirect'});
  let lastUsedCriterian = ws.addCriterian(30, (item) => item.getSecondsSinceLastUsed(), {name:'lastUsed', lowerIsBetter: true});
	let lengthCriterian   = ws.addCriterian(10, (item) => item.sortText.length,           {name:'length',   lowerIsBetter: true});
	ws.prepare(items);
  //ws.equalizeRanges(directCriteran, indirectCriterian);
	ws.sort(items);

	// //for debugging the weighted sort:
	// for (let item of items) {
  //   item.sortDebugGrid = ws.getDebugGrid(item);
  // }
}

export class ReferenceCountQuickPickItem extends PlainQuickPickItem {
  public importStatement:ImportStatement;
  public sortGroupName: string = '';
	public sortGroup: string = '';
	public sortText: string = '';
  public sortDebugGrid :string = '';
  /**
   * for module items, this indicates the number of project modules that use a "full import" such as
   * `import * as ss from 'systemSupport'` to import this module. For other items, such as symbol
   * items, this simply indicates how many times the symbol was imported by modules in the project.
   */
  public directReferenceCount: number = 0;
  /**
   * this is only used by module items, it indicates how many other modules in the project import a
   * **symbol** from this module (as apposed to the `directReferenceCount`, which only counts full
   * imports). */
  public indirectReferenceCount: number = 0;
	public labelIcon: string = '';
  public labelText: string = '';
	/**
	 * used by the weighted sort to bring the shortest names to the top.
	 */
	public searchTargetLength: number = 0;

  constructor(module:Module) {
	  super();
    this.importStatement = new ImportStatement(module);
		this.importStatement.initNonScannedStatement();
	}

	public get referenceCount(): number {
	  return this.directReferenceCount + this.indirectReferenceCount;
	}

  public getSecondsSinceLastUsed(): number {
    return cMaxSecondsSortWeight;
  }

	public render() {
		super.render();
		this.label = ss.infix('$(',this.labelIcon,') ') + this.labelText;
		this.description = this.description + (this.referenceCount > 0 ? '   ❬' + this.referenceCount + '❭' : ''); //  ❬5❭ （2） 【6】  〖18〗  ﹙6﹚ ﹝12﹞

    // for debugging sorting...
    // console.log(`${this.labelText} | ${this.description}`);
    // console.log(ss.indent(this.sortDebugGrid,'  '));
	}

}


export abstract class ProjectModuleQuickPickItem extends ReferenceCountQuickPickItem {
	constructor(
    module:Module,
		public projectModule:ProjectModule
	) {
	  super(module);
    this.buttons = settings.moduleItemButtons;
	}

  public getSecondsSinceLastUsed(): number {
    if (this.projectModule.lastUsedDate)
      return ss.secondsSince(this.projectModule.lastUsedDate);
    return cMaxSecondsSortWeight;
  }

  public setLastUsedDate() {
    this.projectModule.lastUsedDate = new Date();
  };
}

export class SeparatorItem extends PlainQuickPickItem {
  public kind = vscode.QuickPickItemKind.Separator;
  constructor (label:string) {
    super();
    this.label = label;
  }
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


export class SourceModuleQuickPickItem extends ProjectModuleQuickPickItem {
	constructor(
    module:Module,
		public projectModule: SourceModule
	) {
	  super(module,projectModule);
		this.importStatement.universalPathModuleSpecifier = this.sourceModule.universalPathModuleSpecifier;
    this.indirectReferenceCount = this.sourceModule.usedByCount;
		this.searchTargetLength = this.sourceModule.shortenedModuleName.length;
    this.sortGroup = `${cSGSourceModule}`;
    if (projectModule.isCode) {
      this.sortGroup += '-0';
      if (as.cReactExtensions.includes(projectModule.ext)) {
         this.sortGroup += '-2';
         this.sortGroupName = 'react';
      } else if (as.cSvelteExtensions.includes(projectModule.ext)) {
        this.sortGroup += '-3';
        this.sortGroupName = 'svelte';
      } else if (as.isTestModule(projectModule.shortenedModuleName)) {
        this.sortGroup += '-4';
        this.sortGroupName = 'tests';
      } else {
         this.sortGroup += '-0';
         this.sortGroupName = 'project modules';
      }
    } else {
      let plainExt = ss.trimStartChars(projectModule.ext,['.']);
      this.sortGroup += '-1-'+plainExt;
      this.sortGroupName = plainExt;
    }
		this.sortText = projectModule.shortenedModuleName.toLowerCase();
	}

  public get sourceModule() {
	  return this.projectModule;
  }

	public render() {
	  // label
		let moduleName = this.importStatement.displayModuleName;
		this.labelIcon = as.getModuleIcon(this.importStatement.universalPathModuleSpecifier, this.importStatement.isCode, false);
		this.labelText = moduleName;

		// description
		if (this.importStatement.useModuleSpecifierIndex && this.importStatement.codeModuleHasIndex)
		  this.description = this.importStatement.moduleSpecifier
		else
		  this.description = ss.extractPath(this.importStatement.moduleSpecifier);

    super.render();
	}

  public isSameAs(otherQpi:PlainQuickPickItem):boolean {
    if (otherQpi instanceof SourceModuleQuickPickItem)
      if (this.importStatement.universalPathShortenedModuleSpecifier == otherQpi.importStatement.universalPathShortenedModuleSpecifier)
        return true;
    return false;
  }

}

/** this is only used by {@link ImportHelperApi.showReferences} so that it can keep track of where the importing import statement is. */
export class SourceModuleQuickPickItemLocation extends SourceModuleQuickPickItem {
  constructor(
    module:Module,
		projectModule: SourceModule,
		public importLocation: vs.Location
	) {
	  super(module, projectModule);
	}
}

export class NodeModuleQuickPickItem extends ProjectModuleQuickPickItem {
  public projectNodeModule:NodeModule|undefined;
	constructor(
    module:Module,
		public projectModule: NodeModule
	) {
	  super(module,projectModule);
		this.importStatement.universalPathModuleSpecifier = this.nodeModule.universalPathModuleSpecifier;
		// since the `AddImportApi.nodeModules` is a list of node modules that is different from the `Project.nodeModules`,
		// we need to look it up in the `Project.nodeModules` so it can be used to get the usedCount, and other things like lastUsedDate
		this.projectNodeModule = docs.active!.project!.nodeModules.byKey(this.nodeModule.universalPathShortenedModuleSpecifier)?.value;
		if (this.projectNodeModule)
			this.indirectReferenceCount = this.projectNodeModule.usedByCount;
		this.searchTargetLength = this.nodeModule.universalPathModuleSpecifier.length;
    this.sortGroupName = 'node_modules';
		this.sortGroup = String(cSGNodeModule);
  	this.sortText = this.nodeModule.universalPathModuleSpecifier.toLowerCase();
	}

  public get nodeModule() {
	  return this.projectModule;
  }

  public setLastUsedDate() {
    if (this.projectNodeModule)
      this.projectNodeModule.lastUsedDate = new Date();
  };

  public getSecondsSinceLastUsed(): number {
    if (this.projectNodeModule)
      if (this.projectModule.lastUsedDate)
        return ss.secondsSince(this.projectModule.lastUsedDate);
    return cMaxSecondsSortWeight;
  }

	public render() {
		this.labelIcon = as.getModuleIcon(this.nodeModule.universalPathModuleSpecifier, this.nodeModule.isCode, true);
		this.labelText = this.nodeModule.universalPathModuleSpecifier;

		this.description = '(node_modules)';
    super.render();
	}

  public isSameAs(otherQpi:PlainQuickPickItem):boolean {
    if (otherQpi instanceof NodeModuleQuickPickItem)
      if (this.importStatement.universalPathShortenedModuleSpecifier == otherQpi.importStatement.universalPathShortenedModuleSpecifier)
        return true;
    return false;
  }

}

export class SourceModuleImportQuickPickItem extends ProjectModuleQuickPickItem {

	constructor(
    module:Module,
		public projectModule: SourceModuleImport
	) {
	  super(module, projectModule);
    this.importStatement.universalPathModuleSpecifier = this.sourceModuleImport.universalPathModuleSpecifier;
  	this.importStatement.importKind = this.sourceModuleImport.importKind;
		this.importStatement.alias = this.sourceModuleImport.alias;
		this.directReferenceCount = this.sourceModuleImport.usedByCount;
 		this.searchTargetLength = this.sourceModuleImport.aliasOrShortenedModuleName.length;
    this.sortGroupName = 'full module imports';
    this.sortGroup = String(cSGProjectImport);
	  this.sortText = ss.ifBlank(this.sourceModuleImport.alias, ss.extractFileName(this.sourceModuleImport.shortenedModuleName)).toLowerCase();
	}

  public get sourceModuleImport() {
	  return this.projectModule;
  }

	public render() {
		// label
    this.labelIcon = 'globe';
		this.labelText = this.importStatement.asText();

		// description
    this.description = '';

		super.render();
	}

  public isSameAs(otherQpi:PlainQuickPickItem):boolean {
    if (otherQpi instanceof SourceModuleImportQuickPickItem)
      if (this.importStatement.universalPathShortenedModuleSpecifier == otherQpi.importStatement.universalPathShortenedModuleSpecifier) {
        if (this.importStatement.alias != otherQpi.importStatement.alias)
          return false;
        return true;
      }
    return false;
  }

}

export class SourceSymbolImportQuickPickItem extends ProjectModuleQuickPickItem {

	constructor(
      module:Module,
			public projectModule: SourceSymbolImport
	) {
	  super(module,projectModule);
		this.importStatement.universalPathModuleSpecifier = this.sourceSymbolImport.universalPathModuleSpecifier;
  	this.importStatement.importKind = ImportKind.symbolsOnly;
		this.importStatement.hasSymbols = true;
		this.importStatement.symbols.add(this.sourceSymbolImport.name, this.sourceSymbolImport.alias);
	  this.directReferenceCount = this.sourceSymbolImport.usedByCount;
		this.searchTargetLength = (this.sourceSymbolImport.alias == '' ?  this.sourceSymbolImport.name.length : Math.min(this.sourceSymbolImport.name.length, this.sourceSymbolImport.alias.length) );
    this.sortGroupName = 'imported symbols';
		this.sortGroup = String(cSGProjectSymbol);
  	this.sortText = this.importStatement.symbols.items[0]!.nameAndAlias.toLowerCase();
	}

  public get sourceSymbolImport() {
	  return this.projectModule;
  }

	public render() {
		// label
    this.labelIcon = '';
		this.labelText = `{${this.importStatement.symbols.asText()}}`;

		// description
    // (using `quotedModuleSpecifier` here instead of just `moduleSpecifier` because it helps show
    // that this is a full path to a module--including the module name.  It differentiates it from
    // the paths to the module shown for whole modules.)
    this.description = `${this.importStatement.quotedModuleSpecifier}`;

		super.render();
	}

  public isSameAs(otherQpi:PlainQuickPickItem):boolean {
    if (otherQpi instanceof SourceSymbolImportQuickPickItem)
      if (this.importStatement.universalPathShortenedModuleSpecifier == otherQpi.importStatement.universalPathShortenedModuleSpecifier) {
        if (this.importStatement.alias != otherQpi.importStatement.alias)
          return false;
        if (this.importStatement.hasSymbols != otherQpi.importStatement.hasSymbols)
          return false;
        if (this.importStatement.hasSymbols)
          if (this.importStatement.symbols.items[0].nameAndAlias != otherQpi.importStatement.symbols.items[0].nameAndAlias)
            return false;
        return true;
      }
    return false;
  }

}


export class SymbolQuickPickItem extends ProjectModuleQuickPickItem {
	constructor(
    module:Module,
	  projectModule: ProjectModule,
	  public exportSymbol: ModuleSymbol
	) {
	  super(module,projectModule);
		this.importStatement.universalPathModuleSpecifier = this.projectModule.universalPathModuleSpecifier;
		this.importStatement.symbols.add(this.exportSymbol!.name, this.exportSymbol!.alias);
		this.directReferenceCount = this.exportSymbol!.referenceCount;
		this.sortGroup = this.exportSymbol!.type;
		this.sortText = this.exportSymbol!.name.toLowerCase();
	}

	public render() {
	  // label
		this.labelIcon = `symbol-${this.exportSymbol!.type}`;
		this.labelText = this.importStatement.symbols.asText();

    // description
		this.description = this.exportSymbol!.type;

		super.render();
	}

  public isSameAs(otherQpi:PlainQuickPickItem):boolean {
    if (otherQpi instanceof SymbolQuickPickItem)
      if (this.importStatement.universalPathShortenedModuleSpecifier == otherQpi.importStatement.universalPathShortenedModuleSpecifier) {
        if (this.importStatement.alias != otherQpi.importStatement.alias)
          return false;
        if (this.importStatement.hasSymbols != otherQpi.importStatement.hasSymbols)
          return false;
        if (this.importStatement.hasSymbols)
          if (this.importStatement.symbols.items[0].nameAndAlias != otherQpi.importStatement.symbols.items[0].nameAndAlias)
            return false;
        return true;
      }
    return false;
  }

}


export class ModuleSearchQuickPickItems extends PlainQuickPickItems<ProjectModuleQuickPickItem|SeparatorItem> {
}

export class SymbolSearchQuickPickItems extends PlainQuickPickItems<ProjectModuleQuickPickItem|SeparatorItem> {

}

export function addModuleSearchSeparators(moduleSearchQuickPickItems: ModuleSearchQuickPickItems) {
  let lastSortGroup = '';
  let i = 0;
  let item = moduleSearchQuickPickItems[i] as (ProjectModuleQuickPickItem|undefined); // <-- item will never be a SeparatorItems
  while (item) {
    if (lastSortGroup != item.sortGroup) {
      lastSortGroup = item.sortGroup;
      moduleSearchQuickPickItems.splice(i,0,new SeparatorItem(item.sortGroupName));
    }
    i++;
    item = moduleSearchQuickPickItems[i] as (ProjectModuleQuickPickItem|undefined); // <-- item will never be a SeparatorItems
  }
}
