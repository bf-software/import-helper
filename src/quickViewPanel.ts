import * as vscode from 'vscode';
import * as vs from './common/vscodeSupport';
import { sh } from './common/systemSupport';

export class QuickViewPanel {
  public headerText: string = '';
  public descriptionHtml: string = '';
  public items: string = '';
	public css: string = '';
	public tabText: string = '';
  constructor() {
  }

  public show() {
    let webViewPanel = vscode.window.createWebviewPanel('QuickViewPanel',this.tabText, vscode.ViewColumn.Two, {enableScripts: true});
		let codiconsUri = webViewPanel.webview.asWebviewUri(vscode.Uri.joinPath(vscode.Uri.file(vs.globals.extensionEntryPointPath), 'codicon.css'));
		webViewPanel.webview.html = `
			<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">

					<link href="${codiconsUri}" rel="stylesheet" />
					<title>${sh(webViewPanel.title)}</title>
					<style>
						body {
							white-space: nowrap;
							line-height: 1.25rem;
              margin-bottom: 1.25rem;
						}

						  h3 {
    						margin-bottom: .4em;
						  }

							div.headDescription {
								padding-left: 1em;
								padding-bottom: .6em;
								border-bottom: 1px solid var(--vscode-panelSection-border);
								margin-bottom: 1em;
							}

							div.item {
								cursor: pointer;
								margin: auto -10px;
								padding: 0 10px;
							}
							div.item:hover {
								background-color: var(--vscode-list-hoverBackground);
							}
							div.item.selected {
								background-color: var(--vscode-list-inactiveSelectionBackground);
								color: var(--vscode-list-activeSelectionForeground);
							}
								i {
									vertical-align: sub;
								}
								a {
									color: var(--vscode-foreground);
									text-decoration: none;
								}
								span.path {
									opacity: .7;
									font-size: .9em;
									padding-left: .2em;
								}
						${this.css}
					</style>
				</head>
				<body>
					<h3>${sh(this.headerText)}</h3>
					<div class="headDescription">
					  ${this.descriptionHtml}
					</div>
  			  ${this.items}
					<script>
						const vscode = acquireVsCodeApi();
						function click(event) {
							event.preventDefault();
							Array.from(document.getElementsByClassName('selected'))
								.forEach(item => item.classList.remove('selected'));
							event.currentTarget.classList.add('selected');
							vscode.postMessage({
								command: 'click',
								text:
									(event.currentTarget.getAttribute('data-line') ?? '')  + ',' +
									(event.currentTarget.getAttribute('data-column') ?? '') + ',' +
									event.currentTarget.getAttribute('data-moduleFile')
							});
						}
						Array.from(document.getElementsByClassName('item'))
							.forEach(item => item.addEventListener('click', click));
					</script>
				</body>
			</html>
		`;

		webViewPanel.webview.onDidReceiveMessage( (message) => {
			let [sLine, sColumn, file] = message.text.split(',');
			let position:vscode.Position|undefined;
			if (sLine != '' && sColumn != '')
			  position = new vscode.Position(parseInt(sLine), parseInt(sColumn));
			vs.showTextDocument(file,position,vscode.ViewColumn.One);
		});

  }
}