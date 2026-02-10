# Claude Code Reference

This document provides an overview of the Obsidian Folder Filelist plugin codebase for AI-assisted development.

## Project Overview

An Obsidian plugin that automatically generates and maintains filelist index files for specified folders. Creates markdown files containing wiki-links to all files in a folder, sorted by modification time (newest first).

**Current Version:** 1.2.0
**License:** MIT
**Author:** Bill Anderson

## Tech Stack

- **Language:** TypeScript 4.7.4 (ES6 target)
- **Platform:** Obsidian Plugin API (latest)
- **Build Tool:** esbuild (bundler)
- **Runtime:** Node.js (>=16.x)
- **Package Manager:** npm

### Key Dependencies

- `obsidian` - Core plugin API
- `esbuild` - Fast bundler for production builds
- `typescript` - Type checking
- `@types/node` - Node.js type definitions

## Project Structure

```
obsidian-folder-filelist/
├── main.ts                 # Main plugin source (single file)
├── manifest.json           # Obsidian plugin metadata
├── package.json            # npm configuration and scripts
├── tsconfig.json           # TypeScript compiler config
├── esbuild.config.mjs      # Build configuration
├── version-bump.mjs        # Version management script
├── versions.json           # Version history
├── .github/workflows/      # CI/CD automation
│   └── release.yml        # GitHub Actions release workflow
└── README.md              # User documentation
```

### Single-File Architecture

This plugin uses a single-file architecture where all code lives in `main.ts`:
- `FolderListfilePlugin` - Main plugin class
- `FolderListfileSettings` - Settings interface
- `FolderListfileSettingTab` - Settings UI
- Event handlers for file operations (create, delete, rename, modify)

## Build & Development Commands

```bash
# Development mode (watch mode with sourcemaps)
npm run dev

# Production build (type check + optimized bundle)
npm run build

# Version bump (updates manifest.json and versions.json)
npm run version
```

### Build Process

1. **Development:** `npm run dev` runs esbuild in watch mode with inline sourcemaps
2. **Production:** `npm run build` runs TypeScript type checking, then bundles with tree-shaking
3. **Output:** Generates `main.js` (bundled, not committed to repo)

### Testing in Obsidian

To test locally:
1. Build the plugin: `npm run build`
2. Copy `main.js`, `manifest.json`, and `styles.css` (if any) to your Obsidian vault's `.obsidian/plugins/folder-filelist/` directory
3. Reload Obsidian or toggle the plugin in settings

## Coding Conventions

### TypeScript Style

- **Strict typing:** `noImplicitAny`, `strictNullChecks` enabled
- **Naming:**
  - Classes: `PascalCase`
  - Methods/variables: `camelCase`
  - Private methods: marked with `private` keyword
  - Constants: `SCREAMING_SNAKE_CASE`
- **Indentation:** Tabs (as seen in JSON files)
- **File extensions:** Explicit `.toLowerCase()` checks for consistency

### Code Patterns

**Settings Management:**
```typescript
interface FolderListfileSettings { /* ... */ }
const DEFAULT_SETTINGS: FolderListfileSettings = { /* ... */ };
await this.loadSettings();  // Load on init
await this.saveSettings();  // Save on change
```

**Event Handling:**
- Use `registerEvent()` for Obsidian vault events
- Implement debouncing for high-frequency events (modify): 3-second delay
- Clean up timers in `onunload()`

**Logging:**
```typescript
private log(message: string, ...args: unknown[]): void {
  if (this.settings.debug) {
    console.log(`[Folder-filelist] ${message}`, ...args);
  }
}
```

**Error Handling:**
- Use try-catch for file operations
- Show user-friendly `Notice` for errors
- Log detailed errors to console

### Architecture Principles

1. **Reactive Updates:** File changes trigger automatic listfile regeneration
2. **Debouncing:** Prevent excessive updates during rapid file modifications
3. **Filtering:** Exclude files by extension, filename, or the listfile itself
4. **Path Normalization:** Handle root folder ("/") vs empty string consistently

## Workflow Rules
- ALWAYS create a git branch before making changes
- keep commits atomic and focused

### Development Workflow

1. Make changes in `main.ts`
2. Test with `npm run dev` (watch mode)
3. Verify functionality in Obsidian vault
4. Run `npm run build` to ensure production build succeeds
5. Commit changes (excluding `main.js` - it's gitignored)

### Release Workflow

**Version Update:**
```bash
# Update package.json version, then run:
npm run version
# This updates manifest.json and versions.json automatically
```

**Git Tag & Release:**
```bash
git add .
git commit -m "Release X.Y.Z update"
git tag X.Y.Z
git push origin main --tags
```

**Automated Process:**
- Pushing a tag triggers GitHub Actions (`.github/workflows/release.yml`)
- CI builds the plugin and creates a draft GitHub release
- Draft release includes `main.js` and `manifest.json`
- Manually publish the draft release

### Git Practices

- **Never commit:** `main.js`, `*.map`, `node_modules`, `data.json`, `.DS_Store`
- **Commit:** Source files, configs, documentation
- **Branch strategy:** Direct commits to `main` (small project)
- **Tags:** Semantic versioning (X.Y.Z format)

## Key Plugin Functionality

### Settings Configuration

Users configure via Obsidian settings tab:
- **Included folder paths:** Which folders get automatic listfiles (one per line)
- **Listfile pattern:** Filename template, e.g., `ndx-{foldername}.md`
- **Excluded extensions:** File types to skip (e.g., `css, js, json`)
- **Excluded filenames:** Specific files to skip (e.g., `LICENSE`)
- **Exclude listfile from list:** Whether to include the listfile in itself

### File Operations

- **Create/Delete/Rename:** Immediately updates affected folder listfile
- **Modify:** Debounced update (3 seconds) to avoid excessive writes
- **Ribbon icon:** Manual regeneration of all listfiles

### Listfile Format

```markdown
# Files in FolderName

- [[filename1]] *(1/15/2025, 3:30:00 PM)*
- [[filename2]] *(1/14/2025, 2:15:00 PM)*

*This list contains 2 files and was last updated on 1/15/2025, 4:00:00 PM*
```

Files are sorted by modification time, newest first.

## Common Development Tasks

### Adding a New Setting

1. Add property to `FolderListfileSettings` interface (line 15)
2. Add default value to `DEFAULT_SETTINGS` (line 25)
3. Add UI control in `FolderListfileSettingTab.display()` (line 398)
4. Use setting in plugin logic

### Debugging

Enable debug mode in plugin settings to see detailed console logs:
```typescript
this.log("Debug message", variable);  // Only logs if debug: true
```

### Modifying File Filtering

Edit the filter logic in `updateListFileForFolder()` method (lines 320-339):
- Extension filtering: line 337-338
- Filename filtering: line 332-334
- Listfile self-exclusion: line 324-329

## TypeScript Configuration Notes

- **Target:** ES6 (modern but compatible)
- **Module:** ESNext (tree-shaking friendly)
- **Source maps:** Inline for development
- **Strict checks:** Enabled for type safety
- **Isolated modules:** Each file can be transpiled independently

## Questions or Issues?

- Check existing issues: https://github.com/band/obsidian-folder-filelist/issues
- Review Obsidian plugin docs: https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin
- For Obsidian API: https://github.com/obsidianmd/obsidian-api
