# Import Helper

Lets you blast through the tedious chore of manually adding import statements to the top of your typescript, javascript, and svelte modules. The process is simple: first you pick your module, then you either pick your symbols or use an alias. You also get editor commands that let you quickly jump up to your import section and back down to your code. Import Helper supplements vscode's built-in auto-import mechanism. These commands are among my most often used while developing--I expect it will become the same for you!

![Import Helper Demo Animation](docs/screenShots/screenToGif/main-addSymbolImport.gif?raw=true)

## Main Commands

### Add Import ┊ `Alt+F11 (⌥F11 on Mac)`

While you are editing your code, press `Alt+F11 (⌥F11)`, type a few characters, then highlight the desired module using the down arrow key, and press enter. We'll call this 'step 1'.

Next, in 'step 2', type a few characters to locate a symbol you would like to import. Then press enter.

The search edit accepts multiple terms separated by a spaces.

Tips:
When entering characters in the search edit, you don't have to start with the first characters of the module name, you can enter characters that may appear anywhere within the module name.  For large projects, starting with the first characters of a module name can actually be unproductive. See the following example:

Take the case where you have a large project with hundreds of modules.  Many module names probably begin with the same prefix, such as:

`customerSupport, customerBasicInfo, customerOrders, customerTransactions, customerReports, etc.`

The best way to search for `customerTransactions` is to type something like `tran cust` or even `ertran` into the search.  Typing just `cust` by itself will return too many results.  The key is to use the word boundaries within your module names to quickly narrow down the search results.

When you move to 'step 2' and you aren't interested in any particular symbol, the bottom of the list always offers the following non-symbol imports:

  - `import 'xxxxx'`
  - `import { } from 'xxxxx'`
  - `import yyyy from 'xxxxx'`
  - `import * as yyyy from 'xxxxx'`

If you select the empty symbols option `"{ }"`, the cursor will jump up to the import section in your code so you can add your symbols manually. For the module alias options (ones with 'yyyy' in the example), whatever is typed into the symbol search will be offered up as the alias name.

When searching for a module to import, you will also be presented with fully formed aliased module imports where the alias name matches the search string. The import aliases offered come from the aliases used in the other modules of your project. If you select one of those, it will skip the symbol search (aka 'step 2') and add that import right away.

Another way to skip 'step 2' is by searching for and selecting a symbol in 'step 1' by starting your search with a `{`.  For example `{url` will find all symbols used by your project that contain 'url' in their name or alias. Type `{*` to show all symbols imported throughout your project.

By default, the search only looks at modules names, module aliases, and symbols, but not at module paths.  If you want to search for text in a module path, type a '/' character before your search text.  For example, to look for `/myProject/src/client/main.ts` you can type `ma /cli` .  The "ma" will narrow down your search to all modules that contain "ma", and the "/cli" will further only show those modules that have a "cli" in their path.

*Exact matches* - In any type of search, beginning your search text with a double quote means that the text should be an exact match.  For example, if you search for `"fs` you will only get `fs` and not `fspromises` or `pfs`.  Double quotes will also work for symbols and paths like so: `{"uri`, or `/"common`.  In the case of a path, the search looks for an exact match of the a single folder name within the path.  For example `/"common` finds `/proj/common/data`, but not `/proj/commonTools/data`.

File extensions are not included in module name searches.  For example, if you are looking for `mainForm.css` typing `main css` will not find the css file.  To search for extensions, include a dot in the search.  Use `main.css` or `main .css` to find `mainForm.css`.

Missing node_modules? - If you open Import Helper while the active editor tab in vscode is not a Javascript, Typescript, or Svelte file, the modules list will
be missing all of the node_modules your project would normally have access to.  This can't be helped because of the way Import Helper gathers the node_modules to show.  Simply reopen Import Helper while editing a code file to avoid this.

### Go to Imports ┊ `Ctrl+Shift+Up (⇧⌘⭡ on Mac)`

Jumps the editor's cursor to the import section at the top of your code.  If you recently inserted an import statement using `Alt+F11 (⌥F11)`, it will jump to that particular statement.

### Go Back Down ┊ `Ctrl+Shift+Down (⇧⌘⭣ on Mac)`

Jumps back down to where you left off in your code.  You may also use vscode's `back command (Alt+LeftArrow | ^-)` to return to where you left off.

## Module Paths

There are two types of module paths that Import Helper can use when adding import statements to your code:

1. relative to the importing module
   - example: `import * as tools from './library/myTools'`
2. relative to the project's `"baseURL"` path
   - example: `import * as tools from 'myApp/library/myTools'`

Import Helper tries to use the best option when creating imports.  It takes many things into consideration:

- it first looks at the already existing imports and if there is a clear path style being used, it uses that style
- then it looks at the `baseUrl` setting from `tsconfig.json / jsconfig.json`
- finally, it looks at the preferences set in: JavaScript/TypeScript › Preferences: Import Module Specifier

## Aren't VSCode's Auto-Imports Enough?  (Why use Import Helper?)

the good (about vscode's built-in auto-import)

+ vscode quickly adds imports to accommodate pasted code snippets
+ vscode nicely adds an import statement either automatically, or via vscode's `Quick Fix (Ctrl+. | ⌘.) `, but only after you've typed the entire symbol into your code

the bad (about vscode's built-in auto-import)

- vscode works backwards: auto-import forces you to think about the symbol first, when it's often easier to think about the module first.
- vscode has no incremental searching capability -- you always need to type the entire symbol you want to import
- vscode can't auto-import using module aliases

Import Helper fills in the gaps left by vscode's auto-import features by allowing you to find the module you need first, and then letting you search a list of symbols from that module only.  It also lets you search for module and symbol aliases which facilitates the use of standard aliases throughout your code.

## Toolbar Buttons / Additional Commands

These commands are all accessible via buttons on the Import Helper toolbar.

### Show All ┊ `*`

shows all modules, and symbols available to your project (only available in Step 1 of Import Helper)

### Show All Modules ┊ `'*`

shows all modules available to your project (only available in Step 1 of Import Helper)

### Show All Symbols ┊ `{*`

shows all symbols already imported somewhere in your project (only available in Step 1 of Import Helper)

### Open Module ┊ `Alt+O (⌥O on Mac)`

opens the highlighted module in the editor. This is often a more direct route to the module's code than using vscode's `GoTo File... (Ctrl+P | ⌘P)` command, which can include many other files besides source modules.  Another benefit of opening modules this way is that you can find modules by their aliases or by the symbols your project actually uses.  Activating this command in Step 1 of `Add Import (Alt+F11 | ⌥I)` will open the selected module instead of importing it. This command can also be started directly from the editor, in which case it will open Import Helper in "Open Module" mode.  Then selecting a module using the enter key will immediately open it instead of importing it.

If a module is represented by multiple code files, Import Helper will ask to choose one of the files to open. For example, a module may have both a .d.ts and a .js file available.

Lastly, if the current project is not a Typescript or Javascript project, this will simply run vscode's `GoTo File... (Ctrl+P | ⌘P)` command so that you can use the same keyboard shortcut to open files in projects using other languages besides ts/js/tsx/jsx/svelte.

### Show Module References ┊ `Alt+R (⌥R on Mac)`

shows all of the modules in your project that use the selected module or symbol. This command can also be started directly from the editor, in which case it will open Import Helper in "Show Module References" mode.  Then selecting a module will then immediately open the list of references.

### Show Unused Modules

shows the modules that are available to your project, but are not being imported by other modules.  This may identify superfluous modules being included unnecessarily in your project. Note that modules that serve as entry-points into your application will also appear here since they are not being referenced by other modules.

## The Little Numbers: ❬5❭

at the end of item lines in the search results, you may notice a number in angle brackets like `❬5❭`. This is the number of times the item is already being imported by the various modules of your project.  This value is used to sort the results when searching for modules and symbols.  The "most used" items tend to float to the top when searching. You may notice that it isn't exactly sorted by that number, because the sort also takes into consideration then length of the module name and how it is being imported. Modules that are only being used to import symbols may sort below popular symbols or even below other modules being imported as a whole modules.

## Extension Settings

this extension contributes the following settings:

* `import-helper.addImport`: launches the module picker
* `import-helper.goToImports`: jumps your cursor to the import section
* `import-helper.goBackDown`: jumps your cursor back to the original location in the code
* `import-helper.openModule :` lets you open a module's source code in the editor
* `import-helper.showReferences :` show a list of modules that use the selected module
* `import-helper.showUnused :` shows modules that are not referenced by your project code

## Release Notes

### 0.5.0

initial release.
