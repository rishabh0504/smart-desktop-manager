# Sidebar View (`src/components/Sidebar.tsx`)

The `Sidebar` component acts as the global navigation anchor for the application. It provides users immediate static access to standard OS directories (Places), dynamically mounted External Drives, and user-defined Favorites, alongside a fully recursive React tree for deep filesystem traversal.

## Component Overview
The UI is a fixed-width left-hand pane built upon `@/components/ui/scroll-area`. 
It divides dynamically into up to three core sections:
1. **Places**: Auto-resolves the user's base OS paths (Home, Desktop, Documents, Downloads, Music, Pictures, Movies).
2. **External Drives**: Automatically populates if the Rust backend detects removable USB/Thumb drives mounted to the OS.
3. **Favorites**: A persisted list of user-pinned directories.

## State Management (`useSidebarStore`)
Unlike the isolated Main Explorer Tab state, the Sidebar operates on a unified global Zustand store (`useSidebarStore`).
- **State Tracks**:
  - `volumes`: An array of `VolumeInfo` objects fetched from Rust representing all attached storage drives.
  - `expandedPaths`: A `Set<string>` acting as a memory map of which specific `<TreeItem>` directories a user has clicked to expand.
  - `treeNodes`: A massive normalized dictionary (`Record<string, TreeNode[]>`) mapping an absolute folder path (the key) to an array of its immediate children.

## Core Features and Operations

### 1. Recursive Tree Navigation (`<TreeItem />`)
The Sidebar's power comes from its `<TreeItem />` sub-component, which is heavily recursive.
- When a user clicks the Chevron icon (`onChevronClick`), it toggles `expandedPaths.has(path)`. 
- If the path is expanded, the component immediately looks up `treeNodes[node.path]`. If the backend has already supplied this data, it natively maps over the array, recursively rendering another `<TreeItem depth={depth + 1} />` indented dynamically outwards via `paddingLeft: ${depth * 12 + 8}px`.
- **Loading States**: If a path is expanded but `treeNodes[node.path]` is empty, a fallback `<div className="italic">Loading...</div>` mounts. The Zustand store asynchronously fires `read_dir(path)` to the Rust backend and populates the dictionary causing a seamless re-render.

### 2. Context Menu Ecosystem
Every single `<TreeItem>` is wrapped in a `<ContextMenu>`. Right-clicking any folder anywhere in the sidebar provides instantaneous pipeline actions:
- **"Open"**: Fires `handlePathClick(node.path)`, instructing the main Explorer interface to navigate exactly to that directory.
- **"Find Duplicates"**: Injects the folder's absolute path directly into the Deduplication Store's `scanQueue` (`addToDedupe`) and violently swaps the active UI tab to `"dedupe"`.
- **"Clean Empty Folders"**: Similar to above, injects the path into the `useCleanStore` and swaps the UI context seamlessly.
- **"Rename"**: Triggers a native `window.prompt` and fires the `rename_item` Tauri command. Uniquely, this executes `refreshVolumes()` guaranteeing the sidebar UI immediately corrects the visual name upon backend success.

### 3. Native Drag and Drop Implementation
The Sidebar features a sophisticated native HTML5 Drag and Drop (`onDragOver`, `onDragLeave`, `onDrop`) receiver specifically engineered to catch JSON payloads from the main Explorer window.
- **Hover Expansion**: If a user drags files *over* a collapsed folder in the sidebar, a `setTimeout` of 600ms is established (`hoverTimerRef`). If the user holds their mouse there for 0.6 seconds, the folder automatically expands.
- **Execution**: Dropping the files parses `application/x-super-explorer-files` returning an array of origin strings. The component validates that the user isn't trying to drop a folder into itself (`node.path === src`) and then fires a `batch_move` to the backend.

## Backend APIs (Tauri Commands) Integration
- **`homeDir()`** (`@tauri-apps/api/path`): Imported to dynamically resolve absolute paths like `/Users/name/Desktop` regardless of the host OS (macOS/Windows/Linux).
- **Drive Discovery**: Handled intimately by the Zustand `refreshVolumes()` action binding to a Rust backend command querying generic system mount points and resolving their `available_space`.
- **`batch_move`** / **`rename_item`**: Direct FS mutations passed from Sidebar interactions.
