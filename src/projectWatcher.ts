import * as ss from './common/systemSupport';
import * as vscode from 'vscode';
import ts from 'typescript';
import { Project } from './project';
import * as as from './appSupport';

/**
 * watches the files and folders in a project, as well as the project config files that define
 * the project. (tsconfig.json, package.json)
 */
export class ProjectWatcher {
  private projectFileWatchers: vscode.FileSystemWatcher[] = [];
  private configWatcher: vscode.FileSystemWatcher | null = null;
  private packageWatcher: vscode.FileSystemWatcher | null = null;

  constructor(
    public project: Project
  ) {
  }

  /**
   * to keep this simple, we watch for changes to any file or dir in the project's
   * dir and sub dirs. If a file's content changes, we will update the project objects
   * to reflect the change, for any other change, like newly created file/dirs, or deleted
   * files/dirs, we will simply set the project as dirty, and it will re-scan everything
   * after a short delay.
   */
  private addProjectFileWatcher(watchPath: string, isRecursive: boolean = true) {
    let relativePattern = new vscode.RelativePattern(
      vscode.workspace.getWorkspaceFolder(vscode.Uri.file(watchPath))!,
      '**/*'
    );

    let watcher = vscode.workspace.createFileSystemWatcher(relativePattern);

    watcher.onDidDelete(uri => {
      let fileOrDir = ss.internalizeFile(uri.fsPath);
      let absoluteShortenedModuleSpecifier = new as.ModuleSpecifierJuggler(fileOrDir).shortenedModuleSpecifier;
      // if the file that was deleted wasn't one of our modules, just ignore it
      if (this.project.sourceModules.byUniversalPathShortenedModuleSpecifier(absoluteShortenedModuleSpecifier))
        this.project.isDirty = true;
    });

    watcher.onDidChange(uri => {
      // this gets called for both changes to existing files, and new files
      let fileOrPath = ss.internalizeFile(uri.fsPath);
      // if the file that was changed wasn't one of our modules, the call to `moduleContentChanged` below may
      // add it because it might be a new file that should be in our modules. (or it might just be some
      // generated code resulting from traspiling, in which case it will be ignored.)
      this.project.moduleContentChanged(fileOrPath);
    });

    watcher.onDidCreate(uri => {
      this.project.isDirty = true;
    });

    this.projectFileWatchers.push(watcher);
  }

  public run() {
    this.stop();

    if (this.project.config) {

      // add watcher for config file
      this.configWatcher = vscode.workspace.createFileSystemWatcher(this.project.config.tsConfigJsonFile);
      this.configWatcher.onDidDelete(uri => {
        this.project.sourceModules.project.isDirty = true;
      });
      this.configWatcher.onDidChange(uri => {
        this.project.sourceModules.project.isDirty = true;
      });

      // add watchers for project code
      for (let dir in this.project.config.wildcardDirectories) {
        let watchPath = ss.internalizePath(dir);
        let isRecursive = ss.inEnumFlags(this.project.config.wildcardDirectories[dir], ts.WatchDirectoryFlags.Recursive);
        this.addProjectFileWatcher(watchPath, isRecursive);
      }

    } else {
      // just look at all files in the project
      this.addProjectFileWatcher(ss.internalizePath(this.project.sourceModules.project.projectPath));
    }

    // add watcher for package.json file
    if (this.project.packageJsonFile != '') {
      this.packageWatcher = vscode.workspace.createFileSystemWatcher(this.project.packageJsonFile);
      this.packageWatcher.onDidDelete(uri => {
        this.project.isDirty = true;
      });
      this.packageWatcher.onDidChange(uri => {
        this.project.isDirty = true;
      });
    }

  }

  public stop() {
    this.configWatcher?.dispose();
    this.configWatcher = null;

    this.packageWatcher?.dispose();
    this.packageWatcher = null;

    this.projectFileWatchers.forEach(watcher => watcher.dispose());
    this.projectFileWatchers = [];
  }

  public dispose() {
    this.stop();
  }
}
