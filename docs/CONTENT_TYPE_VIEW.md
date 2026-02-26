# Content Type View (`src/components/ContentTypeTab.tsx`)

The `ContentTypeTab` provides a high-level view of files grouped by their types (Categories) or their original Folders. It is an advanced search and triaging tool allowing users to queue items for moving or deletion based on content type (e.g., Images, Videos, Archives).

## Component Overview
The interface allows users to add multiple directories to a `scanQueue` and dispatch a deep content search. It incorporates native virtualization for the results, a rich right-hand side `FilePreviewContent` panel for peeking into files instantly, and bulk operations for curating the filesystem.

## Core Layout and Interactions
- **Scan Queue Builder**: Users can queue multiple folders to be scanned using `@tauri-apps/plugin-dialog`. The selected folders appear as dismissible tags before scanning.
- **Dynamic Grouping**: Users can toggle between grouping results by `CATEGORY` (e.g., "Images", "Videos") or by `FOLDER` (where they were found).
- **View Modes**: The result set can be toggled between a standard `List` view and a visual `Grid` view.
- **Preview Drawer**: Clicking on any file node opens an animated right-side drawer displaying a live preview (via `FilePreviewContent`), complete file paths, and quick action buttons (Queue Move, Queue Delete, Reveal, Open).

## State Management (`useContentTypeStore`)
- The component relies on a dedicated Zustand store (`useContentTypeStore`) for the scanning engine state.
- **State variables referenced**: `scanning`, `progress`, `groups`, `scanQueue`, `expandedCategories`, `groupBy`.
- **Global integrations**: It also integrates tightly with `useDeleteQueueStore` and `useMoveQueueStore` allowing users to push selected files or bulk text directly into operational queues.

## Backend APIs (Tauri Commands) Integration
The scanning and extraction operations are offloaded to specialized Rust commands:

### Scanning Lifecycle
- **`scan_by_content_type`**: Executed when `startScan()` is triggered. This Rust routine traverses the chosen directories recursively, categorizing every file it touches (e.g., matching extensions iteratively).
- **Asynchronous Events**: During execution, the backend emits `scan_progress` payloads back to the frontend. This includes metrics like `scanned` (files found), `elapsed_ms`, and `current_path`. The frontend decodes these into the progress bar, ensuring the UI does not block.

### Bulk Operations and Archive Management
- **`extract_archive`**: Invoked linearly during the `bulkExtract` routine. The frontend iterates over selected `.zip`, `.tar`, and `.rar` files, passing them to the Rust backend for native extraction into their respective directories.
- **`delete_items`**: Immediately following a successful extraction in the `bulkExtract` routine, the original archive file is passed to `delete_items` to be wiped out silently. The component generates a custom UUID `operationId` for traceability.

### System Integration
- **`show_in_finder`**: Communicates with the native OS to open Finder/Explorer highlighting the currently selected query item.
- **`open_item`**: Bypasses the application completely, asking the OS natively to execute the file utilizing the default system application (e.g. opening a `.docx` in Microsoft Word). 

## Performance Optimizations

1. **DOM Virtualization (`@tanstack/react-virtual`)**:
   - Heavy focus on virtualization leveraging `useVirtualizer` anchored to `scrollRef`.
   - **Mechanism**: The estimator formula `estimateSize` dynamically adjusts itself based on state variables: whether a category is currently expanded, the grouping mode, and whether it's executing Grid view or List view math. 
   - This ensures a completely strict bound of DOM nodes regardless of tens of thousands of files matching the query.

2. **Memoized Restructuring (`useMemo`)**:
   - The original dataset `groups` returned from the Rust backend is by category. To flip to `groupBy === "folder"`, the frontend executes an expensive `O(N)` remap of all child `paths` into a `folderMap` directory tree.
   - This transformation is purely encapsulated within a `useMemo` block tracking exactly `[groups, groupBy, viewMode]`, saving thousands of CPU cycles on generic component re-renders (like tracking mouse clicks).

3. **Batched Native Operations**:
   - The `bulkExtract` functionality intelligently isolates only file paths that match archive extension signatures (`.zip`, `.tar`, etc.). 
   - It iterates using an async `for...of` loop waiting for the heavy Rust operation `extract_archive` to return before deleting the payload and moving to the next. This shields the backend from an async bottleneck crisis where 50 archives try to extract on the same thread concurrently.
