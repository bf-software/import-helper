## Change Log

### v1.2.1 - (Aug 24, 2024)

fixed issues:
* when opening node_modules files, it now look for "jsnext:main" as well as "main"
* when opening Import Helper, sometimes blank import statements would be inserted at the top of the module.
  (*These were the result of temporary imports added by IH not being cleaned up properly.*)

### v1.2.0 - (Feb 16, 2023)

fixed issues:
* !! important !! I misspelled the setting: `import-helper.extensions.additional`. (I had a t instead of an s in "extensions".) As a result, your additional extensions setting will disappear--please reenter them. Sorry for the inconvenience.
* adjusted the parsing of `paths` in `tsconfig.json` to better handle paths without asterisks

new features:
* added the `pasteLastIdentifier` command.  After importing a symbol, or module, activate the Paste
  Last Identifier command `Alt+V (⌥V on Mac)` to paste it into your code.

improvements:
* smarter automatic selection of the default search identifier based on the cursor position in the editor.
* search terms with a dot in them now behave like separate terms. ex. `my.test` is now like `my .test`, the same way `my/components` is `my /components`.
* if the text of a single identifier is selected in the editor, it is used as the default search text.
* for .svelte modules, multiple script tags are now supported.  Imports are added to the nearest script section above the cursor.
* `Ctrl+Shift+Up/Down (⇧⌘⭡/⭣ on Mac)` moves between multiple import sections for .svelte modules with multiple script tags.
* the sort order of search results now gives more weight to recently imported or opened modules and symbols.
* for some reason, vscode will not offer things like "svelte/animations" through intellisense. IH now checks
  all of the node_modules' package.json files for more modules to import.

### v1.1.1 - (Oct 1, 2022)

fixed issues:
* when modules were created by a transpiler, Import Helper detected the new/updated files and inadvertently included them in its internal list of modules even if their folder was supposed to be excluded by the `Paths: exclude` setting.
* when importing a symbol or module and its identifier was under the cursor in the editor, it would sometimes be replaced/completed incorrectly.
* when importing svelte modules, the recommended default alias will now always start with an uppercase letter, even if the module name is lower case.


### v1.1.0 - (Mar 27, 2022)

new features:
* symbol search:
  - symbols are now initially grouped by type
  - added ability to search for symbol types by preceding the search term with a /
  - added toolbar buttons to filter for common symbol types

fixed issues:
* could not import a symbol when a default alias import already existed in the importing module.


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
