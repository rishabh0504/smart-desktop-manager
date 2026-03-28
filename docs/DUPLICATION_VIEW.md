# Duplicate Finder View (`src/components/DuplicateTab.tsx`)

The `DuplicateTab` provides a sophisticated interface for identifying, reviewing, and cleaning up exact file duplicates across user-selected directories.

## Component Overview
The UI splits into main interactive areas (zones):
- **Header**: Title, primary **Scan**, and after a run **Refresh** / **New Scan**, elapsed time and wasted-space chips.
- **Scan scope**: Folder queue chips, **Add**, and **Same folder only** when results exist.
- **Results**: Toolbar (select dupes, **Keep Newest**, filter, queues, **Move to Trash**) and a virtualized list.
- **Preview** (optional): `FilePreviewContent` for the selected path with Reveal / Open / queue actions.

## State Management (`useDedupeStore`)
The component delegates heavy state tracking to the `useDedupeStore` built on Zustand.
- **State variables**: `scanning`, `progress`, `duplicates`, `selectedPaths`, **`keeperByHash`** (one “keep” path per duplicate group hash), `scanQueue`, `expandedGroups`, `previewTarget`, `sameFolderOnly`, **`deleting`** / **`deleteBatchProgress`** while a Move to Trash batch runs.
- **Interactions**: Bulk actions pipe paths into `useDeleteQueueStore` or `useMoveQueueStore`. **`keeperByHash`** drives which copy stays; everything else is the default delete selection for that group.

## Core Features and Filtering

### Per-group “Keep” dropdown
Each duplicate group has a **Keep** control listing every path in that group (short labels with full path in tooltips). The chosen path is stored in `keeperByHash`; all other paths in the group are treated as removal candidates when you use **Select Dupes** / **Keep Newest** / the group checkbox (non-keepers). Expanded rows label the kept copy with a **Keep** badge.

### The "Same Folder Only" Filter
[`filterSameFolderGroup`](src/lib/dedupeUtils.ts) builds the filtered list: only paths that share a parent folder with at least one other identical file in the same hash group. **`modified_times` are realigned** to the filtered `paths` so **Keep Newest** and keepers stay correct.

### Intelligent Selection
- **Select Dupes** / **Keep Newest**: Uses `selectDuplicates("all-but-newest", filteredDuplicates)` — updates keepers to the newest mtime per visible group and selects all other paths.
- **Keep Newest** button: same strategy for visible groups.
- **Deselect All**: clears `selectedPaths` only (keepers unchanged).

## Backend APIs (Tauri Commands) Integration
The `DuplicateTab` relies on the Rust backend for hashing at scale.

- **`find_duplicates`** (via `startScan`):
  1. Walks directories under the `scanQueue` (respects `show_hidden_files`, **`show_system_files`** (aligned with explorer), blocked lists, category toggles, and **optional plain-text skipping** — see Settings → Deduplication).
  2. Groups files by exact byte **size**; unique sizes are dropped.
  3. **Partial hash**: reads up to **16KB** from each file for a quick SHA256 digest; mismatching headers are split.
  4. **Full SHA256** on remaining candidates.
  - **Progress**: `dedupe-progress` events; duplicate groups stream on `duplicate-found`. The command returns **`()`** (no duplicate payload over IPC — results arrive via events only).

- **`delete_items`** / **`show_in_finder`** / **`open_item`**:
  - **Move to Trash** sends all selected paths in **one** `delete_items` invoke; the backend deletes in parallel and emits `batch_progress`, `batch_item_completed` (per success), and may return an error if any path failed.
  - The store **listens** to `batch_item_completed` and removes each succeeded path from `duplicates` immediately, so **partial failures** still update the UI for files that reached Trash; failed paths stay selected. Toasts summarize success vs failure counts (`pathsToDelete.length - successCount` when the invoke rejects).
  - Standard OS actions from the preview panel or toolbars.

## Performance Optimizations

1. **Virtualization (`@tanstack/react-virtual`)**:
   - Large result sets only render visible rows; `estimateSize` accounts for the keeper row plus expanded file lines.

2. **Render Decoupling**:
   - Checkboxes use `stopPropagation` where needed; keeper `Select` does not toggle group expand.
