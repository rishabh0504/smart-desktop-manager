# Move Queue Manager View (`src/components/MoveQueueManagerModal.tsx`)

The `MoveQueueManagerModal` operates as the central command center for all file routing and displacement operations. Instead of copying/moving files one by one, users drop files into named "Move Queues", assign a destination directory to the queue, and later execute massive batch moves.

## Component Overview
The UI utilizes a split-pane layout within a modal `<Dialog>`:
- **Left Pane (Queue Tree)**: Renders a collapsible list of all active queues. Expanding a queue reveals the individual files (`FileEntry` objects) queued inside it.
- **Right Pane (Preview & Routing)**: Displays a rich media preview of the currently selected file and provides dropdown menus to re-route the file into a different Move Queue if a mistake was made.

## State Management (`useMoveQueueStore`)
This component strictly manages data through the `useMoveQueueStore` (Zustand), guaranteeing that move queues persist regardless of whether the modal is open or closed.
- **Queue Structure**: A "Queue" is defined mathematically as an object containing an `id`, a `name` ("Images", "Old Projects"), a `folderPath` (the absolute destination directory), and an array of `items` (`FileEntry[]`).
- **Store Actions Executed**: `updateQueue` (renaming, changing destination), `removeQueue` (deleting the queue UI entirely), `clearQueue` (emptying the items successfully moved), and `moveItemToQueue` (swapping an item between queues).

## Core Features and Operations

### Queue Configuration
- **Renaming**: Users can rename queues clicking the `<Pencil />` icon, which invokes a standard browser `prompt()` and updates the store natively.
- **Target Destination Allocation**: Clicking the `<FolderOpen />` icon invokes the Tauri plugin `@tauri-apps/plugin-dialog` mapping `open({ directory: true })`. This allows the user to browse their OS natively and securely attach an absolute path to the queue.

### The File Preview Engine
When a user clicks a file inside a queue on the left pane, the `previewContent` hooks fire:
- **Architecture**: It identifies the file type solely by string `extension`. 
- **Media Optimization (`<VideoPreviewMuted />`)**: Videos trigger a highly specific React sub-component `VideoPreviewMuted`. This component mounts a `<video>` tag but intercepts the "play" events natively (`addEventListener("play")`) to aggressively force `el.muted = true`, ensuring users aren't jumpscared by loud audio while quickly clicking through files.
- **Tauri IPC Overheads**: 
  - Text files -> `get_file_text_content` -> mounts to a `<pre>` string frame.
  - Image/Video/Audio -> Converts the raw `FileEntry.path` directly to the `vmedia://localhost/` Tauri custom protocol stream, completely bypassing IPC serialization limits for zero-latency previews.
  - PDFs -> `get_file_base64_content` -> mounts to `<embed src="data:application/pdf;base64,..." />`.

### Execution and Re-Routing
- **Re-Routing**: On the right pane, the "Move to queue" section isolates all queues *except* the one the file is currently sitting in (`otherQueuesForMove`). Selecting a different queue fires `moveItemToQueue` internally shuffling the file across the Zustand memory maps seamlessly.
- **Execution (`handleMoveAll`)**:
  - The core action button. When clicked, it extracts the target queue from the store, sets a loading lock (`setMovingQueueId(queueId)`), maps the `items` array solely into an array of string `paths`, and delegates it perfectly to the Tauri backend `batch_move` command alongside the assigned `destinationDir`.

## Backend APIs (Tauri Commands) Integration
- **`batch_move`**: This is the absolute critical path of this component. The frontend blindly passes `{ operationId, sources: string[], destinationDir: string }` to the backend. The backend utilizes `rayon` to natively move these files across the OS filesystem in a multi-threaded manner.
- **Reconciliation**: Once the `batch_move` Promise successfully resolves, the frontend calls `clearQueue()`, wiping the files from the UI, and issues a global `refresh(tab.id)` command across the `useExplorerStore()` tabs ensuring the main Explorer UI instantly recognizes that the files have vanished from their original directories and appeared in the new ones.
