# Import Helper

Lets you blast through the tedious chore of manually adding import statements to the top of your typescript, javascript, and svelte modules. The process is simple: first you find your module using the search, then you either pick a symbol or import the whole module using an alias. Import Helper supplements vscode's built-in auto-import mechanism. These commands are among my most often used while developing. I expect they will become the same for you!

![Import Helper Demo Animation](https://github.com/bf-software/import-helper/blob/main/docs/screenShots/screenToGif/main-addSymbolImport.gif?raw=true)

<p align="center"><a href="https://www.youtube.com/watch?v=BX_zH0-KL2Q">☆ ☆ ☆  Watch the video walkthrough. ☆ ☆ ☆</a></p>

<br>

## Main Commands (Quick Overview)
| *command*         | *keyboard shortcut*             | *description*                             |
|-------------------|---------------------------------|-------------------------------------------|
| **Add Import**    | `Alt+F11 (⌥F11 on Mac)`        | quickly pick a module or symbol to import |
| **Open Module**   | `Alt+O (⌥O on Mac)`            | open a module by name, alias or symbol    |
| **Go To Imports** | `Ctrl+Shift+Up (⇧⌘⭡ on Mac)`   | move the cursor to the import section     |
| **Go Back Down**  | `Ctrl+Shift+Down (⇧⌘⭣ on Mac)` | move the cursor back down to the code     |

<br>

## Main Commands (Full Explanation)

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

When invoking `Add Import`, the most recently typed in symbol/identifier to the left of the cursor will become the default text for the module search.  If there isn't any symbol, the text of the most recent search is used.  If a partial symbol, symbol alias, module, or modual alias was found to the left of the cursor, selecting a matching symbol, symbol alias, module, or modual alias will complete the text in the editor.

### Open Module ┊ `Alt+O (⌥O on Mac)`

Opens the highlighted module in the editor. This is often a more direct route to the module's code than using vscode's `GoTo File... (Ctrl+P | ⌘P)` command, which can include many other files besides source modules.  Another benefit of opening modules this way is that you can find modules by their aliases or by the symbols your project uses.  Activating this command in Step 1 of `Add Import (Alt+F11 | ⌥I)` will open the selected module instead of importing it. This command can also be started directly from the editor, in which case it will open Import Helper in "Open Module" mode.  Then selecting a module using the enter key will immediately open it instead of importing it.

If a module is represented by multiple code files, Import Helper will ask to choose one of the files to open. For example, a module may have both a .d.ts and a .js file available.

Lastly, if the current project is not a Typescript or Javascript project, this will simply run vscode's `GoTo File... (Ctrl+P | ⌘P)` command so that you can use the same keyboard shortcut to open files in projects using other languages besides ts/js/tsx/jsx/svelte.

### Go to Imports ┊ `Ctrl+Shift+Up (⇧⌘⭡ on Mac)`

Jumps the editor's cursor to the import section at the top of your code.  If you recently inserted an import statement using `Alt+F11 (⌥F11)`, it will jump to that particular statement.

### Go Back Down ┊ `Ctrl+Shift+Down (⇧⌘⭣ on Mac)`

Jumps back down to where you left off in your code.  You may also use vscode's `back command (Alt+LeftArrow | ^-)` to return to where you left off.

## Module Paths

There are two types of module paths that Import Helper can use when adding import statements to your code:

1. relative to the importing module
   - example: `import * as tools from './library/myTools'`
2. relative to the project's `baseUrl` and/or `paths` settings (aka, a "non-relative" path)
   - example: `import * as tools from 'myApp/library/myTools'`

To determine which path to use, Import Helper looks at the following settings:
* `TypeScript/JavaScript › Preferences: Import Module Specifier`
* `Import-helper › Module Specifier: Path Style`

## Aren't VSCode's Auto-Imports Enough?  (Why use Import Helper?)

the good (about vscode's built-in auto-import)

+ vscode quickly adds imports to accommodate pasted code snippets
+ vscode nicely adds an import statement either automatically, or via vscode's `Quick Fix (Ctrl+. | ⌘.) `, based on symbols in your code.

the bad (about vscode's built-in auto-import)

- vscode works backwards: auto-import forces you to think about the symbol first, when it's often easier to think about the module first.
- vscode has limited searching capability -- you usually need to type the entire symbol you want to import
- vscode can't auto-import using module aliases, or symbol aliases

Import Helper fills in the gaps left by vscode's auto-import features by allowing you to find the module you need first, and then letting you search a list of symbols from that module only.  It also lets you search for module and symbol aliases which facilitates the use of standard aliases throughout your code.

## Toolbar Buttons / Additional Commands

These commands are all accessible via buttons on the Import Helper toolbar.

### Show All ┊ `*`

Shows all modules and symbols available to your project (only available in Step 1 of Import Helper)

### Show All Modules ┊ `'*`

Shows all modules available to your project (only available in Step 1 of Import Helper)

### Show All Symbols ┊ `{*`

Shows all symbols already imported somewhere in your project (only available in Step 1 of Import Helper)

### Show Module References ┊ `Alt+R (⌥R on Mac)`

Shows all of the modules in your project that use the selected module or symbol. This command can also be started directly from the editor, in which case it will open Import Helper in "Show Module References" mode.  Then selecting a module will then immediately open the list of references.

### Show Unused Modules

Shows the modules that are available to your project, but are not being imported by other modules.  This may identify superfluous modules being included unnecessarily in your project. Note that modules that serve as entry-points into your application will also appear here since they are not being referenced by other modules.

## The Little Numbers: ❬5❭

At the end of item lines in the search results, you may notice a number in angle brackets like `❬5❭`. This is the number of times the item is already being imported by the various modules of your project.  This value is used to sort the results when searching for modules and symbols.  The "most used" items tend to float to the top when searching. You may notice that it isn't exactly sorted by that number, because the sort also takes into consideration the length of the module name and how it is being imported. Longer module names and modules that are only being used to import symbols may sort below popular symbols or even below other modules being imported as a whole modules. Examples of whole module imports:
* `import * as ex from 'example';`
* `import ex from 'example';`
* `import 'example';`

## Extension Commands

this extension contributes the following commands:

* `import-helper.addImport`: ┊ `Alt+F11 (⌥F11 on Mac)`\
launches the module picker
* `import-helper.goToImports`: ┊ `Ctrl+Shift+Up (⇧⌘⭡ on Mac)`\
jumps your cursor to the import section
* `import-helper.goBackDown`: ┊ `Ctrl+Shift+Down (⇧⌘⭣ on Mac)`\
jumps your cursor back to the original location in the code
* `import-helper.openModule`: ┊ `Alt+O (⌥O on Mac)`\
lets you open a module's source code in the editor
* `import-helper.showReferences`: ┊ `Alt+R (⌥R on Mac)`\
show a list of modules that use the selected module
* `import-helper.showUnused`:\
shows modules that are not referenced by your project code

## Release Notes

### v1.0.0 - (Mar 12, 2022)

* documentation updates
* tiny fixes

### v0.9.0 - (Feb 18, 2022)

new features:
* added separators and group names to search results:
  - module searches that return a lot of modules are grouped by full module imports, project modules, react, svelte, tests, misc files, node_modules, and imported symbols
  - symbol searches are grouped by full imports already used, available symbols, and generic full imports

* added additional project code extensions such as .mjs, .cjs, .mts, .cts, .mjsx, .cjsx, etc...

fixed issues:
* if upon using IH for the first time after opening a project, you tried to add an import statement that already existed, it would duplicate it in your code

### v0.8.0 - (Feb 3, 2022)

new features:
* when `Add Import ┊ Alt+F11 (⌥F11 on Mac)` is invoked, the nearest symbol/identifier to the left of the cursor will be used as the default
  search text, provided that it was just recently typed in.  If the text is a partial symbol or module name, it will be completed in the
  editor upon selecting a symbol or module name that matches that text.

* as IH loads and parses project source code in the background, it will now update the search results periodically during a search.  This is
  mainly useful during the first search of a coding session. The user may see the reference counts increasing in the search results as the
  project loads--especially for large projects.

fixed issues:
* stopped looking at `tsconfig.js --> include` to determine the modules available to Import Helper. IH now simply looks at all sub folders
  in the project for modules. (this is because developers may not want to use `tsconfig.js --> include` to include ambient modules at all but rather only
  import by using import statements in modules.)


### v0.7.2 - (Dec 18, 2021)

new features:
* moved the `Open Module` and `Show All References` buttons from the toolbar, to the individual items found by the search

fixed some behind-the-scenes issues:
* modifying, creating and adding modules inside of symlinked project folders were not updating the list of searchable modules
* .svelte files that hadn't yet been imported into the project were not available in the modules list
* fixed the link to the repository in the vscode extension marketplace


### v0.7.1 - (Dec 5, 2021)

initial release.
