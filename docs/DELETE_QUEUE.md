# Delete Queue View (`src/components/DeleteQueueModal.tsx`)

The `DeleteQueueModal` manages the application's central repository for impending file and folder deletions. It allows users to review, batch-manage, and fully preview files before finally executing a destructive delete operation.

## Component Overview
The interface functions as a large modal dialog overlay, splitting the real estate between a navigable queue-list on the left and a rich preview pane on the right. 

## State Management (`useDeleteQueueStore`)
- Operates on a global Zustand store (`useDeleteQueueStore`) to persist the items slated for deletion across all application tabs.
- **Local State Tracking**: Utilizes complex localized state tracking for:
  - `selected`: Tracks the currently focused item `FileEntry` being piped into the Preview Pane.
  - `bulkSelected`: A `Set<string>` of paths tracking which items the user has checked for bulk re-routing (e.g., moving to a Move Queue).

## Core Layout and Interactions
### 1. Navigation and Focus
The left-hand sidebar renders the queued items.
- **Keyboard Navigation**: Native `keydown` event listeners are bound to allow users to rapidly step through the queue using `ArrowUp` and `ArrowDown`. Custom scrolling logic (`scrollIntoView({ block: "nearest", behavior: "smooth" })`) ensures the selected item always remains visible during rapid navigation.

### 2. The `PreviewPane` Component
Embedded directly inside the modal is a custom `PreviewPane` component serving entirely to validate the user's deletion intent.
- **Type Checking**: Identifies file types (video, audio, image, text, PDF, folder) purely based on standard string extensions.
- **Backend Data Fetching**:
  - Text files: Invokes `get_file_text_content` returning a raw UTF-8 string for the `<pre>` tag.
  - PDFs: Invokes `get_file_base64_content` rendering directly into an `<embed src={...} />` block.
  - Media (Video/Audio/Image): Leverages the custom Tauri protocol `vmedia://localhost/...` allowing native bypass of browser CORS/binary restrictions to stream the raw media instantly. 

### 3. Bulk Re-Routing
Users who accidentally dump files into the Delete queue can salvage them en-masse.
- Integrates with the `useMoveQueueStore`.
- By using the localized checkboxes, users can select a batch of files and execute `handleBulkMove`. This iterates over the selection, pipes the `FileEntry` objects into `addManyToMoveQueue`, and subsequently ejects them from the Delete queue (`removeFromQueue`).

## Backend APIs (Tauri Commands) Integration
The actual deletion process is heavily gated by confirmation dialogs but simple in execution.

- **`delete_items`**: 
  - Attached to the `confirmDelete` callback.
  - Transmits purely the string `paths` of every item in the queue alongside a unique `operationId`. 
  - **Reconciliation**: Because the Delete Queue operates independently of the Explorer, once `delete_items` resolves, the frontend manually loops over `useExplorerStore().tabs` and forces a `refresh(tab.id)`. This guarantees that if the user had the deleted files visible in an explorer tab, the UI automatically updates to reflect the filesystem change asynchronously.

## UX Polish and Optimizations
- **Auto-Selection**: The modal constantly evaluates the queue length. If an item is removed (via ejection or bulk routing) and the previously `selected` item drops out of the array, the modal automatically falls back (`queue[idx >= 0 ? idx : 0]`) to ensure the preview pane doesn't randomly blank out.
- **Defensive Rendering**: If the user selects a directory, the `PreviewPane` immediately drops the data-fetch pipeline, saving memory and backend cycles, rendering a clean "Folder — no preview" state.
