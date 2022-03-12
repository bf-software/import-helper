## Major Objects

most of the work gets done in the app by accessing members of the `docs.active` object which is a `Document`.

`docs.active` in turn has the following members:

1. `project` - a pointer to the active project associated with the current document.  This contains the configuration settings of the governing config file (`tsconfig.json, jsconfig.json, package.json`) as well as the list of file modules available to be imported into the current document.
2. `module` - a pointer to details about the actual code of the current document. (mainly it contains details about all of the import statements in the current code.)

## Modules, Files and Paths

#### Typescript Module Specifiers

Modules are loaded via import statements.  The last token in the import statement is a string that indicates which module on disk should be imported.  We'll call that token the "module specifier".  In the example, `import * as ss from './common/systemSupport'`, the module specifier is: `./common/systemSupport`

*Clearing Up Term Confusion*: generally, the term "relative path" in computer science refers to any path that is not an absolute path.  Therefore a "non-relative" path would actually mean an absolute path.  However, these terms have been redefined in Typescript. See below.

There are 3 kinds of module specifiers:

1. absolute ----- (meaning absolute to the root of the file system)
   - a file system root path that begins with a `/`or (drive letter in Windows)
   - ex. `'/project/importHelper/src/common/systemSupport'`
   - although this is available for use in import statements, its use is not recommended.  In fact, the typescript docs rarely mention it, they mainly talk about the next two types.
2. "relative" -------- (meaning relative to the importing module)
   - begins with a `.` or a `..` and is relative to the location of the file the import statement is in
   - ex. `'./common/systemSupport'`
   - note:  confusingly, typescript docs usually mean both relative and absolute when they refer to "relative" paths.
   - also note that there is a special "virtual directory" available to relative module specifiers which is controlled by `rootDirs` in `tsconfig.ts`. There will be more on that later.
3. "non-relative" ------- (meaning non-relative to the *importing module*, but still relative to something!)
   - begins with a module name or folder name. (no dots or slashes)  Normally this would be considered a relative path in any platform's command shell, but it has a special meaning in TypeScript; it causes typescript to look in the following places for the module:
     1.  in the `baseURL` setting in your `tsconfig.json`.  (If `baseURL` isn't set, this step is skipped.)
     2.  in the areas described by the `paths` setting in `tsconfig.json`.  (If `paths` isn't set, this step is skipped.)
     3.  in the a `node_modules` folder residing in the same folder as the importing module
     4.  in a the `node_modules` folder residing in the parent folder of the importing module -- and on and on until the root folder is reached
   - ex. `import * as ss from 'src/common/systemSupport';`  - can be set to mean `<your project folder>/src/common/systemSupport` using the `baseUrl`.
   - ex.  `import * as e from 'electron';` - this actually means `<your project folder>/node_modules/electron`
   - remember: absolute paths are **not** "non-relative" in typescript, they are their own thing. Perhaps a better term for this type of path: `import * as ss from 'src/common/systemSupport';` would be "a findable path".


#### Basic Variable Rules

All file paths for all platforms will use forward slashes.  Paths without file names (i.e. a paths to folders) will always end with a forward slash.

#### Naming of Variables Containing File Names and Paths


* `xxxxFile` - is a variable containing a full absolute path and file name to a `file`
  * example: `/docs/data.txt`
* `xxxxFileName` - just the file name portion of `file` (with extension if it exists)
  * example: `data.txt`
* `xxxxPath` - just the path portion of a `file` (always ending with a forward slash)
  * example: `/docs/`

#### Module Types and Variables

- `Module` - the class type that represents a TypeScript module
- `moduleFile` - a full root path and full file name with extension, unless it's from `node_modules`, then it's a relative path starting from `node_modules`.
  - example: `/projects/importHelper/src/common/systemSupport.ts`
  - example: `/projects/importHelper/src/common/plainQuickPick/index.d.ts`
  - example: `electron`
- `modulePath` - the full root path part of the `moduleFile`. If the module is located in `node_modules`, the path will be empty, unless it's located in a sub-folder of `node_modules`.
  - example: `/projects/importHelper/src/common/`
  - example: `/projects/importHelper/src/common/`
  - example:
  - example: react/types
- `moduleFileName` - the file name part of the `moduleFile`
  - example: `systemSupport.ts`
  - example: `index.d.ts`
  - example: `electron`



### Defining and Mapping a Project's Modules

There are 2 main aspects of module resolution: 1. defining, and 2. mapping.

1. defining which modules are your project's main modules
   - all of the code that you create as part of your project are your project's main modules.  (This does not include things in `node_modules`.)
   - default behavior: all `ts,js,tsx,jsx,svelte` files at and in folders below your `tsconfig.json` are part of your project

   - `tsconfig.json | "include": ["<path1>","<path2>",...]` - overrides the default behavior.  Only those files found by the include paths will be part of the project.
   - `tsconfig.json | "exclude": ["<path1>","<path2>",...]` - removes any files that were included by the `include` setting.

2. mapping **additional** module locations

   - default behavior:  import statements reference **your** modules either by absolute, or relative paths.  i.e. the module specifiers must always start with dots or slashes or be full absolute paths. The relative paths are always relative to the file doing the importing.  If a module specifier does not start with a dot or slash or drive letter, it is called a "non-relative" specifier.  Those normally only map to modules found in your `node_modules` folder.  However, the next two items provide for adding other locations for TypeScript to look in, besides `node_modules`.
   - `tsconfig.json | compilerOptions.baseUrl: <path>` - adds an additional method for mapping module locations.  When this is set, import statements can use what are called "non-relative" module specifiers to locate modules in **your** project code, not just in `node_modules`.  All "non-relative" paths to your code will be relative to the `baseUrl: <path>` if it is specified, otherwise they will be relative to the tsconfig.json folder.   (Obviously these "non-relative" module specifiers are still "relative" to something-- they are not absolute paths after all. They are called "non-relative" by typescript because they are not relative to the importing module, but they still are relative paths as far as the operating system is concerned.)
   - ```
     example:
       if we have this structure:
         /project/importHelper/tsconfig.json
         /project/importHelper/src/common/systemSupport
         /project/importHelper/src/common/appSupport
       where tsconfig.json has these settings:
         { "compilerOptions": { "baseUrl": "." } }
       then this:
         import * as ss from '/project/importHelper/src/common/systemSupport';
       can now also be this:
           import * as ss from 'src/common/systemSupport';
       for any module in the project, no matter what sub folder it's located in.
     ```
     By the way, I don't recommend using baseUrl as it can possibly override things in node_modules if you aren't careful.  Using the next option is better.
   - `tsconfig.json | "compilerOptions.paths": "{"match1":[<path1>,<path2>,...], "match2":[...],...}"` - these settings create numerous "fallback" options for typescript to use to to find modules.  To use this, you specify one or more "match" strings.  When the `module specifier` matches a match string, TypeScript will look in all of the corresponding paths to see of the module can be found there. The asterisk in the match string stands in for wildcards.  The portion matched by the asterisk when finding the match string will be inserted into the corresponding paths.
   - ```
     example:
       if we have this structure:
         /project/importHelper/tsconfig.json
         /project/importHelper/src/common/systemSupport.ts
         /project/importHelper/src/common/appSupport.ts
         /project/importHelper/src/tools/strings.ts
       where tsconfig.json has these settings:
         { "compilerOptions": {
             "paths": {
               "*": ["./src/common/*", "./src/tools/*"],
               "wow/*":["./src/tools/*"]
             }
         }}
      this import:
          import * as ss from '/project/importHelper/src/common/systemSupport';
        can now also be this:
          import * as ss from 'systemSupport';
        for any module in the project, no matter what sub folder it's located in.

     How this works:
          our module specifier in the example above is 'systemSupport'. First, typescript woul'd check in the BaseURL for 'systemSupport', but `baseUrl` isn't defined, so it skips that. Then typescript looks at the first "paths" item which is '*'.  '*' means "for any moduleSpecifier", so then it takes the text matched by '*', which by definition is all of the module specifier, which, again is 'systemSupport', and merges it with the first path: './src/common/*' to form './src/common/systemSupport'.  Since './src/common/systemSupport' exists, that's what typescript will use. However if it didn't exist, it would have tried './src/tools/systemSupport' before finally giving up and raising an error.

      similarly, this import:
          import * as ss from '/project/importHelper/src/tools/strings';
     can now also be this:
          import * as ss from 'wow/strings';
        for any module in the project, no matter what sub folder it's located in.

     How this works:
          our module specifier in the example above is 'wow/strings', so first, typescript checks in the BaseURL for 'wow/strings', which it doesn't find.  Then typescript looks at the first "paths" item which is '*'.  '*' means "for any moduleSpecifier", so then it takes the text matched by '*', which by definition is all of the module specifier, which, again is 'wow/strings', and merges it with the first path: './src/common/*' to form './src/common/wow/strings'.  Since './src/common/wow/strings' does NOT exist, typescript tries the next path in the '*' item to no avail.  Then typescript notices that 'wow/strings' is matched by 'wow/*', so it takes the part of 'wow/strings' that the * matched, which is 'strings' and merges it with the first path: './src/tools/*' forming './src/tools/strings'. Since './src/tools/strings' exists, that is used.
     ```

   - `tsconfig.json | "compilerOptions.rootDirs": "[<path1>,<path2>,...]"` - every module in the paths specified in the array will be considered to exist together in the same folder when resolving relative modules.  This is called the "virtual directory".  There is only one "virtual directory".
   - ```
     example:
       if we have this structure:
         /project/importHelper/tsconfig.json
         /project/importHelper/src/common/systemSupport.ts
         /project/importHelper/src/common/appSupport.ts
         /project/importHelper/src/tools/tools.ts
       where tsconfig.json has these settings:
         { "compilerOptions": { "rootDirs": ["./src/common","./src/tools"] } }
       and tools.ts has this import:
         import * as ss from '/project/importHelper/src/common/systemSupport';
       it can now also be this:
         import * as ss from './systemSupport';
     ```

## project.ts

this module contains everything Import Helper needs to know about the various projects located in a workspace.  Import Helper does not need to know about all projects from the get-go, it only needs to know about the current project you're working on.

once a file opens up,  Import Helper (IH) considers you to be working on the project that the opened file belongs to.  If a project object hasn't already been established for that file, IH will search up the folder tree to find the closest `tsconfig.json, jsconfig.json, package.json` in that order and establish a new Project object.

### Project class

contains details about the config file(s), available modules, and preferred module aliases of the project.

once Project objects are established, they remain open for the life of the workspace.  Project objects will watch the file system for changes and update themselves accordingly.



#### File Modules Caching

By default, all workspace folders are searched for modules during the loading process. A configuration setting is used to exclude any number of folders from being included. Found modules are cached and their folders are watched for files being added, or removed.

#### Node Module Caching

Modules offered by the node_modules folder are pulled in by leveraging vscode's built in completion mechanism.  When we need a list of node_module modules, IH creates a blank import statement at the top of the code like `import {} from '';`  Then positions the cursor after the first quote in the empty module name and runs `vscode.commands.executeCommand('vscode.executeCompletionItemProvider',...`  This will fill an array with all of the node_modules available to the code.   The only way it changes is by adding or removing modules or dependencies from the project's `package.json`.  So-- if `package.json` changes, these node modules will need to be reloaded.

!!! However, there is a problem with caching node modules, and that is: the user may activate Import Helper very early in the vscode loading process.  If that happens, vscode only returns a partial list of node_modules available.  A subsequent run will return more.  Until we can be sure that we are getting all modules, we can't cache them.  Luckily, getting the list of node modules is quite fast anyway.



# To Do

## (easy items)

### paths

scan folders pointed to by tsconfig.json --> paths for modules in addition to the [project folder tree / tsconfig.json --> include areas] in case some paths reside outside of the project.
(although, I'm not sure if TypeScript modules will work if they are located outside of the project -- and not specified in the tsconfig.json --> include setting. I still need to do some investigation there.)

### (hard items)

### webviews --> treeview

change the webview to use a treeview and (possibly the references treeview) for showing References and Unused References instead of an HTML panel.

### open module - source code options

when the open module command is used to open a module, if there are multiple source code options (like a .d.ts, .mjs, or .js files) that are associated with the module, IH will provide a list to choose from.  This list comes from complicated reverse module resolution code that looks at all the crazy settings in `package.json`.  Currently the code that analyzes the `main`, `types`, `typesVersons` and `exports` entries is a little weak (as I don't fully understand all of the mapping possibilites made available by those features).

### locate the exported symbol when opening

when IH is used to open a symbol item, it currently opens the module it is exported from and leaves the cursor at the default position.  ID should parse the module and place the cursor at the export declaration for the symbol.

### determine default exports for modules

IH should limit the full module import options on the bottom of the symbol search based on what is being exported by the module.  For example, if there is only a default export, and no symbols (like for common JS modules), there shouldn't be a `import * as xxxx from 'yyyy';` option, as that can't be used.  Also, when there isn't a default export, there shouldn't be an `import xxxx from 'yyyy';`. The problem is that the only way to do this is to actually parse the module completely (and possibly other modules if the module has any re-export statements like:  `export * from 'zzzz';` )

### tests

tests are quite weak.  need more.
