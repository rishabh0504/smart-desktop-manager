# File Explorer View (`src/panels/FilePanel.tsx`)

The `FilePanel.tsx` component is the core of the file browsing experience in the application. It provides a highly optimized, dual-mode (List and Grid) interface for interacting with the file system.

## Component Overview
The `FilePanel` component accepts a `tabId` prop, which corresponds to a specific tab managed by the zustand `explorerStore`. It dynamically renders the directory contents, a breadcrumb navigation bar, utility toolbars, and contextual dialogs for file operations like renaming, creating new folders, and processing archives.

## State Management and Core Hooks
- **Global State (`zustand`)**: State transitions, directory loading/paginating (`loadMore`), sorting, view modes (`list` vs `grid`), selections, and clipboard operations are all handled asynchronously via `useExplorerStore`. 
- **Preview Integration**: Interacts closely with `usePreviewStore` and `useSettingsStore` to load rich previews of supported media and document types upon user interaction.
- **Local State**: Context menus, drag-and-drop region sizing, rename dialogs, and folder creation states are kept tightly scoped within the component using localized `useState` hooks. Ref hooks (`useRef`) keep track of scroll elements and load guards.

## Interactions & Capabilities
- **Rich Context Menus and Operations**: Integration with Tauri backend commands allows native, OS-level interaction (e.g., `batch_copy`, `batch_move`, `delete_items`, `extract_archive`, `compress_to_zip`). 
- **Keyboard Navigation**: Comprehensive keyboard shortcuts implemented natively via event listeners: Arrow keys for directional navigation, Enter for directory traversal, Delete for file deletion, and Space for instant preview toggling.
- **Drag and Drop Selection**: A custom-built implementation for rectangular selection via dragging, combined with math boundary collision checks to instantly interact with the store's selection set. 
- **Drag and Drop Files**: Supports moving and copying files by intercepting OS-level drag interactions and issuing `batch_move` / `batch_copy` logic based on modifier keys.

## **Super Detailed Performance Optimizations**

The `FilePanel` is built to gracefully handle directories containing tens of thousands of deeply nested files without degrading runtime frametimes or UI responsiveness. 

### 1. Windowing and DOM Virtualization
By explicitly incorporating `@tanstack/react-virtual`, the List View mode is entirely virtualized:
- **How it Works**: The component calculates total required vertical space (`rowVirtualizer.getTotalSize()`) and places a static height container. Inside, it calculates the viewport position, rendering only the ~20 to ~40 `FileRow` items currently in the user's visible window (along with a configured `overscan: 20` for smooth scrolling). 
- **Impact**: The DOM tree remains extremely shallow consisting of just a few dozen nodes, reducing memory overhead, layout thrashing, and React reconciliation time linearly from $O(N)$ (where $N$ is file count) down to $O(V)$ (where $V$ is visible elements).

### 2. Memoized Derivations
- **Data Grouping (`useMemo`)**: The application sorts files into headers ("Folders", "Images", "Videos", etc.) using `groupEntries`. This expensive restructuring is fully memoized and bound to the dependency array `[tab.entries]`. The CPU is spared from recalculating structures on extraneous renders.

### 3. Stable Callback Architecture (`useCallback`)
Every critical handler is wrapped securely in `useCallback` hook boundaries matching strictly defined dependency arrays:
- **`onItemClick`**: Binds the click interface tightly. Modification keys (`Cmd/Meta` or `Shift`) bypass recalculation while providing instant multi-select feedback. 
- **`handleDelete` / `onScroll` / `handlePasteInPanel`**: Ensures that cascading renders do not recreate these functions, keeping the memory allocation and garbage collection footprint negligible.

### 4. Efficient Scroll Bounding and Pagination Guard 
- **The Load More Throttle**: The infinite scrolling logic listens to scroll heights natively (`scrollHeight - scrollTop - clientHeight < 400`). To prevent racing conditions where the user scrolls rapidly triggering 50 concurrent backend queries to Tauri, the scroll trigger leverages an immutable `useRef` boolean (`loadMoreTriggered.current`). This safely forces the backend pipeline into mutual exclusion, resolving only when the asynchronous request finishes.

### 5. Custom Rectangular Collision Matrix
Instead of deeply injecting drag event listeners into every single file node (which destroys performance on `onMouseMove`), the `FilePanel`:
- Listens to mouse movements *only* at the top-level parent `div`.
- Renders a single lightweight absolute div visualizing the blue drag `selectionRect`.
- Iterates synchronously over rendered nodes matching `[data-path]` utilizing high-speed native Javascript dimensions (`offsetTop`, `offsetLeft`) checking rectangular intersections bounding boxes against the single drag overlay box, drastically reducing event loop overhead.

## Backend APIs (Tauri Commands) Integration
The `FilePanel` relies closely on Rust-based backend API calls via `invoke` to perform file system operations optimally and cleanly. 

### Data Fetching
- **`read_dir_chunked`** (via `useExplorerStore`): Handles pagination (`loadMore`) and initial path loading (`setPath`). The backend returns directory chunks sorted and paginated based on current settings (e.g. skipping hidden files). This prevents JSON serialization bottlenecks for folders containing thousands of items.

### File Operations
- **`create_folder`**: Accepts `{ path }`. Creates a new empty directory and immediately triggers a UI refresh.
- **`rename_item`**: Accepts `{ path, newName }`. Safely executes an OS-level rename via Rust's standard library and refreshes the panel tracking state.
- **`delete_items`**: Accepts `{ operationId, paths }`. Executes bulk asynchronous deletions. The frontend spawns a unique `operationId` UUID, allowing the backend to trace the deletion progress cleanly and emit progress payload events.
- **`batch_copy` / `batch_move`**: Accepts `{ operationId, sources, destinationDir }`. Triggered via paste (`Ctrl+V` / `Cmd+V`) or Drag-and-Drop operations across panels. It executes mass file transfers on a background thread utilizing Rust's `rayon` parallelism.

### Archive Management
- **`compress_to_zip`**: Accepts `{ paths, destPath }`. Compresses single or multiple selected files natively on the backend, displaying a toast notification once completed.
- **`extract_archive`** (via `FileContextMenu`): Accepts `{ path }`. Unpacks supported archive formats (`.zip`, `.tar.gz`, etc.) seamlessly into the current directory.

### System Integration
- **`show_in_finder`**: Accepts `{ path }`. Communicates with the native OS to open Finder (macOS) or Explorer (Windows) highlighting the currently selected directory/file.
