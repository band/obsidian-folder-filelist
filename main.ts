import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  TAbstractFile,
  Vault,
  addIcon,
} from "obsidian";

// Define the settings interface
interface FolderListfileSettings {
  listFilePattern: string;
  excludedExtensions: string[];
  excludeListFileFromList: boolean;
	includedFolders: string[];
	excludedFilenames: string[];
  debug: boolean;
}

// Default settings
const DEFAULT_SETTINGS: FolderListfileSettings = {
  listFilePattern: "ndx-{foldername}.md",
  excludedExtensions: ["css", "js", "json", "toml"],
  excludeListFileFromList: true,
	includedFolders: [],
	excludedFilenames: ["LICENSE"],
  debug: false,
};

// Custom icon for the ribbon button
const REFRESH_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
  <path d="M21 3v5h-5"></path>
  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
  <path d="M3 21v-5h5"></path>
</svg>
`;

export default class FolderListfilePlugin extends Plugin {
  private debounceTimers: Record<string, NodeJS.Timeout> = {};
  settings: FolderListfileSettings;

  private log(message: string, ...args: unknown[]): void {
    if (this.settings.debug) {
      console.log(`[Folder-filelist] ${message}`, ...args);
    }
  }

  // generate the filename based on folder
  private getListFileNameForFolder(folderPath: string): string {
    const folderName = folderPath.split("/").pop() || "root";
    return this.settings.listFilePattern.replace("{foldername}", folderName);
  }

  async onload() {
    console.log(`Folder-Filelist: loading plugin v${this.manifest.version}`);
    await this.loadSettings();

    // Add custom icon
    addIcon("refresh-folder-listfiles", REFRESH_ICON);

    // Add ribbon icon
    this.addRibbonIcon(
      "refresh-folder-listfiles",
      "Generate folder index files",
      async () => {
        if (this.settings.includedFolders.length !== 0) {
          await Promise.all(
            this.settings.includedFolders.map((item) =>
              this.updateListFileForFolder(`${item}`)
            )
          );
          new Notice(
            `Successfully updated list files for ${this.settings.includedFolders.length} folders.`
          );
        }
      }
    );

    // Register file events to update listfiles
    this.registerEvent(
      this.app.vault.on("create", (file: TAbstractFile) => {
        this.log(`registerEvent - create - file: ${file.name}`);
        if (
          file instanceof TFile &&
          file.name === this.getListFileNameForFolder(file.path)
        ) {
          return;
        }
        this.handleFileChange(file);
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file: TAbstractFile) => {
        this.log(`registerEvent - delete - file: ${file.name}`);
        this.handleFileChange(file);
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
        this.log(`registerEvent - rename - file: ${file.name}`);
        // Handle the file in its new location
        this.handleFileChange(file);

        // Handle the old folder listfile update
        const oldFolderPath = this.getFolderPathFromFilePath(oldPath);
        this.log(`register event - rename - oldFolderPath: ${oldFolderPath}`);
        if (oldFolderPath !== null) {
          this.updateListFileForFolder(oldFolderPath);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("modify", (file: TAbstractFile) => {
        this.log(`registerEvent - modify - filePath: ${file.path}`);
        // Skip if this is a list file just modified to avoid recursive updates
        if (file instanceof TFile && file.name.startsWith("ndx-")) {
          this.log("Skipping update for list file itself");
          return;
        }

        this.handleFileModification(file);
      })
    );

    // Add settings tab
    this.addSettingTab(new FolderListfileSettingTab(this.app, this));

    // on load rebuild the specified indices
    this.log(`onload - includedFolders: ${this.settings.includedFolders}`);
    for (const item of this.settings.includedFolders) {
      this.updateListFileForFolder(`${item}/`);
    }
  }

  onunload() {
    // Clean up when plugin is disabled
    // Clear all debounce timers
    for (const timer of Object.values(this.debounceTimers)) {
      clearTimeout(timer);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // Gets the folder path from a file path
  getFolderPathFromFilePath(filePath: string): string | null {
    const lastSlashIndex = filePath.lastIndexOf("/");
    if (lastSlashIndex === -1) {
      return ""; // Root folder
    }
    return filePath.substring(0, lastSlashIndex);
  }

  // Check if a folder is included in the settings
  isFolderIncluded(folderPath: string): boolean {
    if (this.settings.includedFolders.length === 0) {
      return false; // If no folders are included, don't generate for any
    }

    // Normalize the empty root path for comparison
    const normalizedPath = folderPath === "" ? "/" : folderPath;

    // Check if the folder path is in the includedFolders list
    return this.settings.includedFolders.some((includedFolder) => {
      // Direct match
      if (includedFolder === folderPath) {
        return true;
      }

      // If the included folder is the root folder "/"
      if (includedFolder === "/" && folderPath === "") {
        return true;
      }

      return false;
    });
  }

  // Handle file changes (creation, deletion, rename)
  async handleFileChange(file: TAbstractFile) {
    let folderPath: string | null = null;

    // If a file, update the listfile in its folder
    if (file instanceof TFile) {
      folderPath = this.getFolderPathFromFilePath(file.path);
      this.log(`handleFileChange - TFile folderPath:  ${folderPath}`);
    }
    // If it's a folder, update the parent folder's listfile
    else if (file instanceof TFolder) {
      folderPath = this.getFolderPathFromFilePath(file.path);
      this.log(`handleFileChange - TFolder folderPath: ${folderPath}`);
    }

    if (folderPath === null) {
      return;
    }
    //
    if (!this.isFolderIncluded(folderPath)) {
      this.log(`Skipping folder ${folderPath} - not in includedFolders list`);
    }
    // is this an included folder?
    if (file instanceof TFile) {
      const listFileName = this.getListFileNameForFolder(folderPath);
      if (this.settings.excludeListFileFromList && file.name === listFileName) {
        return;
      }
    }
    // now update the listfile for this folder
    await this.updateListFileForFolder(folderPath);
  }

  async handleFileModification(file: TAbstractFile) {
    // Only process regular files, not folders
    if (!(file instanceof TFile)) {
      return;
    }
    // Get the folder containing this file
    const folderPath = this.getFolderPathFromFilePath(file.path);
    this.log(
      `handleFileModification - file: ${file.path}, folderPath: ${folderPath}`
    );
    if (folderPath === null) {
      return;
    }
    if (!this.isFolderIncluded(folderPath)) {
      this.log(`Skipping folder ${folderPath} - not in includedFolders list`);
      return;
    }

    const listFileName = this.getListFileNameForFolder(folderPath);
    if (this.settings.excludeListFileFromList && file.name === listFileName) {
      this.log("Skip update for list file itself");
      return;
    }

    // Implement debouncing to prevent excessive updates
    if (this.debounceTimers?.[folderPath]) {
      clearTimeout(this.debounceTimers[folderPath]);
      this.log(`Cleared existing debounce timer for ${folderPath}`);
    }

    // Initialize debounceTimers if it doesn't exist
    if (!this.debounceTimers) {
      this.debounceTimers = {};
    }

    // Set a new timer
    this.log(`Setting debounce timer for ${folderPath}`);
    this.debounceTimers[folderPath] = setTimeout(() => {
      //      this.log(`Debounce timer fired for ${folderPath}, updating list file`);
      this.updateListFileForFolder(folderPath);
      delete this.debounceTimers[folderPath];
    }, 3000); // 3-second debounce
  }

  // Create a listfile for the active folder
  async createListFileForActiveFolder() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("No active file. Please open a file first.");
      return;
    }

    const folderPath = this.getFolderPathFromFilePath(activeFile.path);
    if (folderPath === null) {
      new Notice("Could not determine the folder of the active file.");
      return;
    }

    if (!this.isFolderIncluded(folderPath)) {
      new Notice(
        `Folder ${folderPath || "root"} is not in the included folders list.`
      );
      return;
    }

    await this.updateListFileForFolder(folderPath);
    new Notice(`Created listfile for folder: ${folderPath || "root"}`);
  }

  // Update or create the listfile for a specific folder
  async updateListFileForFolder(folderPath: string) {
    try {
      // Check if this folder is included in the settings
      if (!this.isFolderIncluded(folderPath)) {
        this.log(
          `Skipping folder ${folderPath} - not in included folders list`
        );
        return;
      }

      // Get all files in the folder
      const folder = folderPath
        ? this.app.vault.getAbstractFileByPath(folderPath)
        : this.app.vault.getRoot();

      if (!folder || !(folder instanceof TFolder)) {
        console.error(`Folder not found: ${folderPath}`);
        return;
      }

      const listFileName = this.getListFileNameForFolder(folderPath);

      // Get all files in the folder
      const files = folder.children
        .filter((file) => file instanceof TFile)
        .filter((file) => {
          // Skip the listfile itself if the setting is enabled
          if (
            this.settings.excludeListFileFromList &&
            file.name === listFileName
          ) {
            return false;
          }

					// Skip excludedFilenames
					if (this.settings.excludedFilenames.includes(file.name)) {
						return false;
					}

          // Skip files with excluded extensions
          const extension = (file as TFile).extension.toLowerCase();
          return !this.settings.excludedExtensions.includes(extension);
        });

      // Create content for the listfile
      const folderName = folderPath.split("/").pop() || "Root";
      let content = `# Files in ${folderName}\n\n`;

      // Sort files by modification time in reverse order (newest first)
      files.sort((a, b) => {
        const fileA = this.app.vault.getAbstractFileByPath(a.path);
        const fileB = this.app.vault.getAbstractFileByPath(b.path);

        if (fileA instanceof TFile && fileB instanceof TFile) {
          return fileB.stat.mtime - fileA.stat.mtime;
        }
        return 0; // Default return value if conditions are not met
      });

      // Add links to each file with modification date
      for (const file of files) {
        if (file instanceof TFile) {
          const modDate = new Date(file.stat.mtime).toLocaleString();
          content += `- [[${file.basename}]] *(${modDate})*\n`;
        }
      }

      content += `\n*This list contains ${files.length} ${
        files.length === 1 ? "file" : "files"
      } and was last updated on ${new Date().toLocaleString()}*`;

      // Create or update the listfile
			this.log(`Updating listfile for: ${folderPath}`);

			const listFilePath = folderPath
        ? `${folderPath}/${listFileName}`
        : listFileName;

      if (await this.app.vault.adapter.exists(listFilePath)) {
        await this.app.vault.adapter.write(listFilePath, content);
      } else {
        await this.app.vault.create(listFilePath, content);
      }
    } catch (error) {
      console.error("Error updating folder listfile:", error);
      new Notice(
        "Error updating folder listfile. Check the console for details."
      );
    }
  }
}

// Settings tab for the plugin
class FolderListfileSettingTab extends PluginSettingTab {
  plugin: FolderListfilePlugin;

  constructor(app: App, plugin: FolderListfilePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Folder Listfile Settings" });

    new Setting(containerEl)
      .setName("Listfile pattern")
      .setDesc(
        "The pattern for the filename; use {foldername} to insert folder name."
      )
      .addText((text) =>
        text
          .setPlaceholder("ndx-{foldername}.md")
          .setValue(this.plugin.settings.listFilePattern)
          .onChange(async (value) => {
            this.plugin.settings.listFilePattern = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Excluded extensions")
      .setDesc(
        "Comma-separated list of file extensions to exclude from the list"
      )
      .addText((text) =>
        text
          .setValue(this.plugin.settings.excludedExtensions.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.excludedExtensions = value
              .split(",")
              .map((ext) => ext.trim().toLowerCase());
            await this.plugin.saveSettings();
          })
      );

    const fragment = document.createDocumentFragment();
    const link = document.createElement("a");
    link.href =
      "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#writing_a_regular_expression_pattern";
    link.text = "MDN - Regular expressions";
    fragment.append(
      "Folder paths for which to generate file lists. One folder path per line."
    );
    fragment.append(" Leave empty to disable auto-generation.");

    new Setting(containerEl)
      .setName("Included folder paths")
      .setDesc(fragment)
      .addTextArea((textArea) => {
        textArea.inputEl.setAttr("rows", 6);
        textArea
          .setPlaceholder("dailyNotes\nprojects/active\nnotes/references")
          .setValue(this.plugin.settings.includedFolders.join("\n"));

        textArea.inputEl.onblur = async (e: FocusEvent) => {
          const paths = (e.target as HTMLInputElement).value;
          this.plugin.settings.includedFolders = paths
            .split("\n")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
            .map((item) => {
              return item.endsWith("/") ? item.slice(0, -1) : item;
            });
          await this.plugin.saveSettings();
        };
      });

    new Setting(containerEl)
      .setName("Excluded filenames")
      .setDesc(fragment)
      .addTextArea((textArea) => {
        textArea.inputEl.setAttr("rows", 6);
        textArea
          .setPlaceholder("LICENSE\n")
          .setValue(this.plugin.settings.excludedFilenames.join("\n"));

        textArea.inputEl.onblur = async (e: FocusEvent) => {
          const paths = (e.target as HTMLInputElement).value;
          this.plugin.settings.excludedFilenames = paths
            .split("\n")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
            .map((item) => {
              return item.endsWith("/") ? item.slice(0, -1) : item;
            });
          await this.plugin.saveSettings();
        };
      });

    new Setting(containerEl)
      .setName("Exclude listfile from list")
      .setDesc(
        "Whether to exclude the list file itself from the generated list"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.excludeListFileFromList)
          .onChange(async (value) => {
            this.plugin.settings.excludeListFileFromList = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
