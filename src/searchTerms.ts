import * as ss from './common/systemSupport';
import * as cs from './common/collectionSupport';
import { docs } from './document';







/** (m)odule (t)erm (t)ype */
export enum MTT {
  any, symbol, moduleName, modulePath, currentFilePath, all, allUnused, allSymbols, allModules
};

export class ModuleSearchTerm {
	constructor(
	  public lowercaseText: string,
	  public type: MTT,
		public isExact: boolean
	) {}
}

export class ModuleSearchTerms extends cs.FfArray<ModuleSearchTerm> {
	public lastSearchText:string = '';

	/**
	 * `this.parseSearchText()` determines if a weighted search is appropriate and sets this accordingly
	 */
	public maxTermLength: number = 0;

	constructor(
	) {
	  super();
	}

	public clear() {
		this.length = 0;
		this.lastSearchText = '';
	}

  public hasType(type:MTT):boolean {
	  return Boolean(this.byFunc( (item) => item.type == type ) );
	}

  /**
	 * parses the search text into terms, different term types find different things
	 */
	public parseSearchText(searchText:string) {
		this.maxTermLength = 0;
		searchText = searchText.trim();
		this.clear();
    this.lastSearchText = searchText;

		if (searchText == '*') {
      this.push(new ModuleSearchTerm('', MTT.all, false));
			return;
		}

		if (searchText == '*x') {
      this.push(new ModuleSearchTerm('', MTT.allUnused, false));
			return;
		}

    searchText = searchText.replaceAll('\'',' \'');
    searchText = searchText.replaceAll('{',' {');
    searchText = searchText.replaceAll('/',' /');
		searchText.split(' ').forEach( termString => {
		  termString = termString.toLowerCase().trim();
      let termType = MTT.any;
			if (termString.startsWith('\'')) {
			  termString = termString.substr(1);
				termType = MTT.moduleName;
				if (termString == '*')
          termType = MTT.allModules;
			} else if (termString.startsWith('{')) {
		    termString = termString.substr(1);
			  termType = MTT.symbol;
				if (termString == '*')
          termType = MTT.allSymbols;
		  } else if (termString.startsWith('/')) {
			  termType = MTT.modulePath;
			  termString = termString.substr(1);
				if (termString == '.')
				  termType = MTT.currentFilePath;
			}
			let isExact = false;
			if (termString.startsWith('"')) {
			  termString = ss.trimChars(termString,['"']);
				isExact = true;
			}
			if (termString == '')
				return;
			if (termString.length > this.maxTermLength)
        this.maxTermLength = termString.length;
			this.push(new ModuleSearchTerm(
				termString,
				termType,
				isExact
			));
		});

    return;
	}

  /**
   * pass the properties of a module/symbol to this to determine if all search terms match it. As soon
   * as any search terms fail to match, this returns false.
   *
	 */
	public termsMatch(moduleName:string, modulePath:string, symbolName:string='', symbolAlias:string='') {
		if (this.length == 0)
			return false;

	  /*
      Special care must be taken when searching for extensions, or extension-like things.  For example, if
	    a user chooses to name their modules like "screen.api.configuration.ts", we want a module search
      looking for `config` to find the example, but `ts` to not find the example. `ts` would return too many
      results.  However if the user wants to look in only `.ts` files we should allow a term of `.ts` to find
      the results.  The bottom line is that we want `config` and `.config` to return the example above, but
      only want `.ts` to also return the example, not `ts` without a dot.
    */

    let lowerCaseModuleName = moduleName.toLowerCase();
		let lowerCaseModulePath = modulePath.toLowerCase();
		let lowerCaseSymbolName = symbolName.toLowerCase();
		let lowerCaseSymbolAlias = symbolAlias.toLowerCase();
    let lowerCaseModuleExt = ss.extractFileExt(lowerCaseModuleName);
    let lowerCaseModuleNameNoExt = ss.removeFileExt(lowerCaseModuleName)

		if (
		  this.hasType(MTT.all) ||
			this.hasType(MTT.allModules) ||
			this.hasType(MTT.allSymbols) ||
			this.hasType(MTT.allUnused)
		)
			return true;

    let isSymbolItem = lowerCaseSymbolName || lowerCaseSymbolAlias;

		for (let term of this) { // <-- check every term against all parts of the potential item, if anything fails to match, we return false.

      if (term.type == MTT.moduleName || (!isSymbolItem && term.type == MTT.any)) {
			  let searchModuleName = lowerCaseModuleNameNoExt;
				if (term.lowercaseText.startsWith('.')) {
				  searchModuleName = lowerCaseModuleName;
					if (term.isExact)
					  return (lowerCaseModuleExt == term.lowercaseText)
				}
				if (term.isExact) {
				  if (searchModuleName != term.lowercaseText)
					  return false;
				} else if (this.length == 1 && term.lowercaseText.length == 1) {
					if (! searchModuleName.startsWith(term.lowercaseText) )
						return false;
				} else {
					if (searchModuleName.indexOf(term.lowercaseText) == -1 )
						return false;
				}

			} else if (term.type == MTT.symbol || (isSymbolItem && term.type == MTT.any) ) {
				if (term.isExact) {
				  if (lowerCaseSymbolName != term.lowercaseText && lowerCaseSymbolAlias != term.lowercaseText)
					  return false;
				} else if (this.length == 1 && term.lowercaseText.length == 1) {
					if (!lowerCaseSymbolName.startsWith(term.lowercaseText) && !lowerCaseSymbolAlias.startsWith(term.lowercaseText))
						return false;
				} else {
					if (lowerCaseSymbolName.indexOf(term.lowercaseText) == -1 && lowerCaseSymbolAlias.indexOf(term.lowercaseText) == -1)
						return false;
				}

			} else if (term.type == MTT.currentFilePath) {
				if (lowerCaseModulePath != './')
					return false;

			}	else if (term.type == MTT.modulePath) {
			  // only look at the part of the module path that is below the project path
			  lowerCaseModulePath = ss.removePrefix(lowerCaseModulePath, docs.active?.project?.projectPath ?? '');
				if (term.isExact) {
				  if (! lowerCaseModulePath.match( new RegExp(`(^|\\/)(${ss.escapeRegex(term.lowercaseText)})(\\/|$)`)  ))
					  return false;
				} else if (this.length == 1 && term.lowercaseText.length == 1) {
					if (lowerCaseModulePath.indexOf('/'+term.lowercaseText) == -1)
						return false;
				} else {
					if (lowerCaseModulePath.indexOf(term.lowercaseText) == -1)
						return false;
				}

			}
		}

		return true;
	}

}


/** (s)ymbol (t)erm (t)ype */
export enum STT {
  symbolName, symbolType
};

export class SymbolSearchTerm {
	constructor(
	  public lowercaseText: string,
    public type: STT,
		public isExact: boolean
	) {}
}

export class SymbolSearchTerms extends cs.FfArray<SymbolSearchTerm> {
  public lastSearchText:string = '';
  constructor(
	) {
	  super();
	}

  public hasType(type:STT):boolean {
	  return Boolean(this.byFunc( (item) => item.type == type ) );
	}

  public typeCount(type: STT) {
    let ct = 0;
    for (let term of this)
      if (term.type == type)
        ct++;
    return ct;
  }

	public clear() {
		this.length = 0;
		this.lastSearchText = '';
	}

	public parseSearchText(searchText:string) {
		searchText = searchText.trim();
		searchText = searchText.replace('{','');
    searchText = searchText.replace('*','');
    searchText = searchText.replaceAll('/',' /');
		this.clear();
		this.lastSearchText = searchText;
		searchText.split(' ').forEach( termString => {
			termString = termString.toLowerCase().trim();
			if (termString == '')
				return;
      let type = STT.symbolName;
      if (termString.startsWith('/')) {
			  type = STT.symbolType;
			  termString = termString.substr(1);
      }
			let isExact = false;
			if (termString.startsWith('"')) {
			  termString = ss.trimChars(termString,['"']);
				isExact = true;
			}
			this.push(new SymbolSearchTerm(
				termString,
        type,
				isExact
			));
		});
	}

	public termsMatch(symbolName:string, symbolAlias:string, symbolType:string) {
	  let lowercaseSymbolName = symbolName.toLowerCase();
		let lowercaseSymbolAlias = symbolAlias.toLowerCase();
    let lowercaseSymbolType = symbolType.toLocaleLowerCase();
		if (this.length == 0) // <-- unlike in step 1's search (searchModule()), we don't need an asterisk to show all, showing all is the default
		  return true;
		for (let term of this) {
      if (term.type == STT.symbolType) {
        if (term.isExact) {
          if (lowercaseSymbolType != term.lowercaseText)
            return false;
        } else if (term.lowercaseText.length == 1) {
          if (! lowercaseSymbolType.startsWith(term.lowercaseText))
            return false;
        } else {
          if (! lowercaseSymbolType.includes(term.lowercaseText))
            return false;
        }
      } else {
        if (term.isExact) {
          if (lowercaseSymbolName != term.lowercaseText && lowercaseSymbolAlias != term.lowercaseText)
            return false;
        } else if (this.typeCount(STT.symbolName) == 1 && term.lowercaseText.length == 1) {
          if (! lowercaseSymbolName.startsWith(term.lowercaseText) && ! lowercaseSymbolAlias.startsWith(term.lowercaseText))
            return false;
        } else {
          if (! lowercaseSymbolName.includes(term.lowercaseText) && ! lowercaseSymbolAlias.includes(term.lowercaseText))
            return false;
        }
      }
	  }
		return true;
	}
}
