# Duplicate Finder View (`src/components/DuplicateTab.tsx`)

The `DuplicateTab` provides a sophisticated interface for identifying, reviewing, and cleaning up exact file duplicates across user-selected directories.

## Component Overview
The UI splits into main interactive areas:
- A top toolbar for configuring scan parameters (`scanQueue`, "Same Folder Only" toggle).
- A virtualized central list displaying grouped duplicates based on exact file hashes.
- A right-hand `PreviewPane` overlay (driven by `FilePreviewContent`) rendering previews of the actively targeted file.

## State Management (`useDedupeStore`)
The component delegates heavy state tracking to the `useDedupeStore` built on Zustand.
- **State variables**: `scanning`, `progress`, `duplicates` (the raw dataset from the backend), `selectedPaths` (the specific files the user wants to act upon), and `scanQueue`.
- **Interactions**: Tracks multi-queue management allowing users to pipe duplicate files directly into the global `useDeleteQueueStore` or `useMoveQueueStore` via bulk actions.

## Core Features and Filtering

### The "Same Folder Only" Filter
An advanced `useMemo` block drives the `filteredDuplicates` variable. 
- **Mechanism**: When `sameFolderOnly` is enabled, the frontend iterates over the `duplicates` master list returned from Tauri. It maps each `path` within a hash group to its parent directory. If a single parent directory contains *more than one* file from the exact same hash group, those specific paths are yielded to the UI. If a hash group spans multiple folders but no folder contains $\ge 2$ copies simultaneously, the group is hidden from the user.

### Intelligent Selection
The component provides a powerful "Select All But One" (`all-but-newest`) algorithm.
- Rather than forcing users to manually tick 500 duplicate files, a single button click dispatches `.selectDuplicates("all-but-newest", filteredDuplicates)`. This action isolates the subset of files currently visible to the user (respecting the "Same Folder" filter) and selects all copies for deletion *except* for the one with the most recent modified metric.

## Backend APIs (Tauri Commands) Integration
The `DuplicateTab` relies on a highly concurrent Rust backend to solve the mathematically intense problem of finding duplicate files across tens of thousands of files efficiently.

- **`find_duplicates`** (Dispatched via `startScan`):
  1. The backend walks the directory tree of all folders in the `scanQueue`.
  2. It first groups all files purely by their exact byte `size`. Files with unique sizes are instantly discarded (an $O(1)$ elimination).
  3. For files sharing the exact same size, the backend reads a small 4KB chunk of the file (a fast partial hash) to eliminate files that share a size but have different starting headers.
  4. Finally, for the remaining files, it computes a full SHA256 cryptographic hash to guarantee identical matches.
  - *Progress Events*: Throughout this pipeline, the backend streams `scan_progress` events detailing the `"Discovery"` (walking Phase) and the `"Analyzing"` (hashing phase) alongside `elapsed_ms`.

- **`delete_items`** / **`show_in_finder`** / **`open_item`**:
  - Utilizes standard unified OS actions available from within the preview drawer or batch action toolbars.

## Performance Optimizations

1. **Virtualization (`@tanstack/react-virtual`)**:
   - Because duplicate reports can easily return thousands of matched groups (e.g., duplicated `.npm` caches), `useVirtualizer` ensures only the strictly visible elements paint onto the browser DOM.
   - The `estimateSize` callback intelligently recalibrates row heights mathematically dynamically depending on whether a `group` is currently toggled open (`expandedGroups.has(hash)`) and multiplies by the number of files nested under that hash. 

2. **Render Decoupling**:
   - Checkboxes are intercepted via `e.stopPropagation()` strictly. Ticking a checkbox delegates the target `path` directly to the Zustand store via `toggleSelection()`. The store mutation only causes the targeted row's UI to re-paint the blue background `data-[state=checked]`, leaving the 15,000 other rows completely undisturbed in the React reconciler.
