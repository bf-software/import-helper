import * as vscode from 'vscode';
import { Disposable } from 'vscode';
import * as cs from './common/collectionSupport';
import * as ss from './common/systemSupport';

export let settings = {quickPickItemVisibleLength: 72}

export class PlainQuickPickButton implements vscode.QuickInputButton {
  public readonly iconPath: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | vscode.ThemeIcon;
  public readonly tooltip?: string | undefined;
  public onClick:(item?:vscode.QuickPickItem)=>void;
  public parent:PlainQuickPickButtons;

  constructor(parent:PlainQuickPickButtons, toolTip:string, iconFileName:string, onClick: (item?:vscode.QuickPickItem) => void) {
    this.iconPath = {
      light: vscode.Uri.file(parent.iconPath + '--light--' + iconFileName),
      dark: vscode.Uri.file(parent.iconPath + '--dark--' + iconFileName)
    }
    this.tooltip = toolTip;
    this.onClick = onClick;
    this.parent = parent;
  }
}

export class PlainQuickPickButtons extends Array {
  public iconPath: string = '';
  public add(toolTip:string, iconName:string, onClick: (item?:vscode.QuickPickItem) => void) {
    this.push(new PlainQuickPickButton(this, toolTip, iconName, onClick));
  }
}

export class PlainQuickPickItem implements vscode.QuickPickItem {
	public label: string = '';
	public description: string = '';
	public detail: string = '';
	public picked: boolean = false;
	public alwaysShow: boolean = true;
  public buttons: vscode.QuickInputButton[] = [];

  public hasSeparatorLine: boolean = false;
  public isSelectable: boolean = true;

  public sameAs(item:PlainQuickPickItem | null):boolean {
		if (!item)
		  return false;
		return (item.label == this.label) && (item.description == this.description);
	}

  public render() {
		if (this.hasSeparatorLine)
		  this.detail = '⎯'.repeat(settings.quickPickItemVisibleLength);
		else
		  this.detail = '';
  }

}

class LoadingQuickPickItem extends PlainQuickPickItem {
  constructor() {
    super();
    this.isSelectable = false;
  }

  public render() {
    super.render();
    this.label = '$(loading~spin) Loading...';
  }
}

export class PlainQuickPickItems<T extends PlainQuickPickItem> extends cs.FfArray<T> {

  public get isLoading() {
    return (this.length > 0 && this[0] instanceof LoadingQuickPickItem);
  }

  public set isLoading(value:boolean) {
    if (value == this.isLoading)
      return;
    this.clear();
    if (value == false)
      return;
    let loadingItem = new LoadingQuickPickItem();
    loadingItem.render();
    //@ts-ignore - yea, this might be a problem if descendents try to read the `loading` item as the extended PlainQuickPickItem, not sure how to deal with that.
    this.push( loadingItem );
  }


	public getRecommendations():T[] {
		let items:T[] = [];
		for (let item of this) {
			items.push(item);
		  if (item.hasSeparatorLine)
			  return items;
		}
		return [];
	}

  public removeRecommendationsFromNormals() {
    let recommendations = this.getRecommendations();
		let normals = this.slice(recommendations.length);
    this.clear();
    this.push(...recommendations);

    normals = normals.filter( (normal) => {
      for (let recommendation of recommendations)
        if (normal.label == recommendation.label && normal.description == recommendation.description)
          return false;
      return true;
    });

    this.push(...normals);

    let last = this.last?.value;
    if (last) {
      last.hasSeparatorLine = false;
      last.render();
    }
  }

  public renderAll() {
    let last = this.last?.value;
    if (last)
      last.hasSeparatorLine = false;
    this.forEach(item => item.render());
  }

}


/**
 * wraps a vscode.QuickPick and prevents all of the automatic searching, sorting and fuzzy search highlighting features.
 */
export class PlainQuickPick<T extends vscode.QuickPickItem> implements vscode.QuickPick<T> {
  public cHighlightBlockerChar:string = '>';
  private quickPick = vscode.window.createQuickPick<T>();


  constructor() {
    this.matchOnDescription = false;
    this.sortByLabel = false;

    this.onDidTriggerButton((button:vscode.QuickInputButton) => {
      (button as PlainQuickPickButton).onClick(this.activeItems[0]);
    });

    this.onDidTriggerItemButton((event:vscode.QuickPickItemButtonEvent<T>) => {
      (event.button as PlainQuickPickButton).onClick(event.item);
    });

    this.onDidChangeValue((newValue) => {
      if (newValue == '')
        return;
      if (newValue == this.cHighlightBlockerChar)
        this.quickPick.value = '';
      else if (newValue.length > 2 && newValue.match(/^>[^>]>/))
        this.value = ss.splice(newValue,2,1,'');
      else if (! this.quickPick.value.startsWith(this.cHighlightBlockerChar))
        this.value = newValue;
    });
  }

  // Delegate most of these to the wrapped QuickPick ******************************************
  // overriden below: public get value():string { return this.quickPick.value }
  // overriden below: public set value(value:string) { this.quickPick.value = value }
  public get placeholder():string | undefined { return this.quickPick.placeholder }
  // overriden below: public set placeholder(placeholder:string | undefined) { this.quickPick.placeholder = placeholder }
  public get buttons(): readonly vscode.QuickInputButton[] { return this.quickPick.buttons }
  public set buttons(value: readonly vscode.QuickInputButton[]) {this.quickPick.buttons = value }
  public get items():readonly T[] { return this.quickPick.items }
   // overriden below: public set items(items: readonly T[]) { this.quickPick.items = items }
  public get canSelectMany(): boolean { return this.quickPick.canSelectMany }
  public set canSelectMany(canSelectMany:boolean) { this.quickPick.canSelectMany = canSelectMany }
  public get matchOnDescription(): boolean { return this.quickPick.matchOnDescription }
  public set matchOnDescription(matchOnDescription:boolean) { this.quickPick.matchOnDescription = matchOnDescription }
  public get matchOnDetail(): boolean { return this.quickPick.matchOnDetail }
  public set matchOnDetail(matchOnDetail:boolean) { this.quickPick.matchOnDetail = matchOnDetail }
  public get sortByLabel(): boolean { return (this.quickPick as any).sortByLabel }  // sortByLabel isn't in the types yet as of vscode/index.d.ts v1.48. Oct-2021, still not there in v1.63
  public set sortByLabel(sortByLabel:boolean) { (this.quickPick as any).sortByLabel = sortByLabel }
  public get activeItems():readonly T[] { return this.quickPick.activeItems }
  public set activeItems(activeItems: readonly T[]) { this.quickPick.activeItems = activeItems }
  public get selectedItems():readonly T[] { return this.quickPick.selectedItems }
  public set selectedItems(selectedItems: readonly T[]) { this.quickPick.selectedItems = selectedItems }
  public get title():string | undefined { return this.quickPick.title }
  public set title(title:string | undefined) { this.quickPick.title = title }
  public get step():number | undefined { return this.quickPick.step }
  public set step(step:number | undefined) { this.quickPick.step = step }
  public get totalSteps():number | undefined { return this.quickPick.totalSteps }
  public set totalSteps(totalSteps:number | undefined) { this.quickPick.totalSteps = totalSteps }
  public get enabled(): boolean { return this.quickPick.enabled }
  public set enabled(enabled:boolean) { this.quickPick.enabled = enabled }
  public get busy(): boolean { return this.quickPick.busy }
  public set busy(busy:boolean) { this.quickPick.busy = busy }
  public get ignoreFocusOut(): boolean { return this.quickPick.ignoreFocusOut }
  public set ignoreFocusOut(ignoreFocusOut:boolean) { this.quickPick.ignoreFocusOut = ignoreFocusOut }
  public get keepScrollPosition(): boolean { return this.quickPick.keepScrollPosition ?? false }
  public set keepScrollPosition(keepScrollPosition:boolean) { this.quickPick.keepScrollPosition = keepScrollPosition }
  public show() { this.quickPick.show() }
  public hide() { this.quickPick.hide() }
  public dispose() { this.quickPick.dispose() }
  public onDidAccept(listener: (e: void) => any, thisArgs?: any, disposables?: Disposable[]): Disposable { return this.quickPick.onDidAccept(listener,thisArgs,disposables) };
  public onDidChangeValue(listener: (e: string) => any, thisArgs?: any, disposables?: Disposable[]): Disposable { return this.quickPick.onDidChangeValue(listener,thisArgs,disposables) };
  public onDidTriggerButton(listener: (e: vscode.QuickInputButton) => any, thisArgs?: any, disposables?: Disposable[] | undefined):Disposable { return this.quickPick.onDidTriggerButton(listener,thisArgs,disposables) }
  public onDidTriggerItemButton(listener: (e: vscode.QuickPickItemButtonEvent<T>) => any, thisArgs?: any, disposables?: Disposable[] | undefined):Disposable { return this.quickPick.onDidTriggerItemButton(listener,thisArgs,disposables) }
  public onDidChangeActive(listener: (e: readonly T[]) => any, thisArgs?: any, disposables?: Disposable[] | undefined):Disposable { return this.quickPick.onDidChangeActive(listener,thisArgs,disposables) }
  public onDidChangeSelection(listener: (e: readonly T[]) => any, thisArgs?: any, disposables?: Disposable[] | undefined):Disposable { return this.quickPick.onDidChangeSelection(listener,thisArgs,disposables) }
  public onDidHide(listener: (e: void) => any, thisArgs?: any, disposables?: vscode.Disposable[] | undefined):Disposable { return this.quickPick.onDidHide(listener,thisArgs,disposables) }
  // *******************************************************************************

  private addHighlightBlocker(value:string):string {
    if (value.startsWith(this.cHighlightBlockerChar) || (value == ''))
      return value;
    else
      return this.cHighlightBlockerChar+value;
  }

  /**
   * one unfortunate side effect of this method of stopping the highlighting is that if the user
   * inserts a character at the beginning of the text (before the highlight blocking character)
   * the cursor will jump to the end of the string, which is very confusing.  Unfortunately the
   * quickpick doesn't allow access to cursor events of the text edit, which would be needed
   * to prevent this.
   */
  private removeHighlightBlocker(value:string):string {
    return value.replace(this.cHighlightBlockerChar,'');
  }

  public get value():string {
    return this.removeHighlightBlocker(this.quickPick.value);
  }

  public set value(value:string) {
    this.quickPick.value = this.addHighlightBlocker(value);
  }

  public set placeholder(placeholder:string | undefined) {
    this.quickPick.placeholder = this.cHighlightBlockerChar + ' ' + placeholder;
  }

  public set items(items: readonly T[]) {
    this.quickPick.items = items;
  }


}