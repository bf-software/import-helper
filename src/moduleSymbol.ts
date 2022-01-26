import * as ss from './common/systemSupport';
import * as vscode from 'vscode';
import { docs } from './document';
import * as vs from './common/vscodeSupport';
import * as cs from './common/collectionSupport';
import { SourceSymbolImport } from './projectModule';

/**
 * represents a symbol that a module exports
 */
export class ModuleSymbol {
	public name: string = '';
	public alias: string = '';
	public type: string = '';
  public referenceCount: number = 0;
  public sourceSymbolImport: SourceSymbolImport | undefined;
}

/**
 * represents all the symbol symbols a module exports.  Use {@link load} to begin the symbol gathering process, which
 * may take some time because vscode looks in a lot of places in the file system to get the full list.
 */
export class ModuleSymbols extends cs.FfArray<ModuleSymbol> {
  public isLoading:boolean = false;

	constructor(
	) {
		super();
	}

  /**
	 * slowly loads the symbols exported by the moduleSpecifier and returns when complete.  It does this by simply inserting
	 * a temporary import statement at the top of the active document's code and gets vscode to provide a list of symbols it knows about.
	 * @param moduleSpecifier should be the specifier that will untimately be used in the import if it is chosen by the user
	 */
	public async load(tempInsertPos:number, moduleSpecifier:string, universalPathShortenedModuleSpecifier:string) {
		this.clear();
		this.isLoading = true;
		try {
			let completions = await vs.getCompletions( 'import {' , '} from \''+ moduleSpecifier +'\'; ', tempInsertPos);

			for (let comp of completions) {
				let moduleSymbol = new ModuleSymbol();
				moduleSymbol.name = (typeof comp.label == 'string' ? comp.label : comp.label.label);
				if (typeof comp.kind =='undefined')
					moduleSymbol.type = '?';
				else if (comp.kind == vscode.CompletionItemKind.Text || comp.kind == vscode.CompletionItemKind.Snippet || comp.kind == vscode.CompletionItemKind.Keyword)
					continue;
				else
					moduleSymbol.type = vscode.CompletionItemKind[comp.kind].toLowerCase();

        // establish the reference counts, and extra aliased symbols for the found symbols
  		  let addedNonAliasSymbol = false;
				let usedProjectSymbols = docs.active!.project!.sourceSymbolImports.allByUniversalPathShortenedModuleSpecifierAndName(universalPathShortenedModuleSpecifier,moduleSymbol.name);
				if (usedProjectSymbols.length) {
					for (let sourceSymbolImport of usedProjectSymbols) {
						let newModuleSymbol = new ModuleSymbol();
						newModuleSymbol.name = moduleSymbol.name;
						newModuleSymbol.type = moduleSymbol.type;
						newModuleSymbol.alias = sourceSymbolImport.alias;
						newModuleSymbol.referenceCount = sourceSymbolImport.usedByCount;
            newModuleSymbol.sourceSymbolImport = sourceSymbolImport;  // <-- make a note of this for finding symbol references in step 2
						this.push(newModuleSymbol);
						if (newModuleSymbol.alias == '')
						  addedNonAliasSymbol = true;
					}
				}
				if (!addedNonAliasSymbol)
				  this.push(moduleSymbol);
			}



		} finally {
      this.isLoading = false;
		}
	}

}