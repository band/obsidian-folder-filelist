# Simple Folder Filelist for Obsidian  

![Latest Version](https://img.shields.io/github/v/release/turulix/obsidian-folder-index?sort=semver)
![Build Status](https://img.shields.io/github/actions/workflow/status/turulix/obsidian-folder-index/release.yml)


Generate a file in specified folders containing wiki-links to files in that folder.  

## Features

- Automatic filelist file generation  
- Ribbon Icon to regenerate all filelists  
- The filelist is a list of wiki-links
- Reverse modification time listing (newest file first)

### Use

- Install and enable the Plugin like any other. 

- In the **Settings** tab:  
  - Specify “Included folder paths”: folders for which you want filelist files  
	  - A folder path of “/“ generates an `ndx-root.md` file of the vault root directory  


  - Specify “Excluded extensions”: file extensions to exclude from folder filelists  
  
  - Adjust Listfile pattern: default pattern recommended
  
  - Exclude listfile from list: default and recommended setting is "On"  
