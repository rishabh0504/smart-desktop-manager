# Clean View (`src/components/CleanTab.tsx`)

The `CleanTab` is a dedicated interface for finding and deleting recursively empty folders, helping users maintain an organized file system.

## Component Overview
The `CleanTab` component provides a dashboard for managing directory scanning operations. It leverages a globally accessible zustand store (`useCleanStore`) to handle the multi-threaded scanning procedure and state.

## Core Layout and Interactions
- **Target Selection**: Users can use standard plugin dialogs (`open` from `@tauri-apps/plugin-dialog`) to attach one or multiple folders strictly into the `scanQueue`. Selected targets are visualized as highly interactive pill-shaped badges under the Toolbar.
- **Progress Visibility**: Upon starting a scan, a dedicated `<Progress />` indicator coupled with dynamic DOM nodes appears, visually streaming the count of `scanned_folders`, `elapsed_ms`, and currently evaluated paths in real-time.
- **Results Management**: The `CleanTab` mounts a virtualized selection list providing instantaneous interactions for marking findings for deletion (`toggleSelection`, `selectAll`, `deleteSelected`).

## State Management (`useCleanStore`)
- The tab relies completely on the externalized bound state, meaning a scan happening in the background persists regardless of whether the user navigates to the Explorer, Deduper, or Settings views.
- **State variables referenced**: `scanning`, `progress`, `findings`, `selectedPaths`, `scanQueue`.
- **Actions executed**: `startScan`, `resetScan`, `addToQueue`, `removeFromQueue`, `toggleSelection`, `selectAll`, `selectNone`, `deleteSelected`.

## Super Detailed Backend Integrations

The cleaning process requires intensive file-system traversal. The frontend communicates with specialized Tauri Rust handlers precisely designed for recursive emptiness checks.

### Scanning Lifecycle
- **`scan_empty_folders`**: The primary workhorse command. The frontend dispatches this via the `startScan` method inside the store.
   - **Performance**: Inside Rust, this command is designed to walk directories recursively from the bottom-up (using libraries like `jwalk` or standard reverse iteration). It evaluates if a directory contains any files or nested non-empty directories. 
   - **Asynchronous Events**: During execution, the backend emits high-frequency `scan_progress` payload events back to the frontend. The `CleanTab` dynamically decodes these payloads into the `progress` object (visualizing `status`, `elapsed_ms`, `current_path`, and `scanned_folders`) ensuring the main UI thread never blocks during massive I/O loads.

### Deletion and Desktop Interactions
- **`delete_items`**: Once the user curates their selection and clicks the destructive "Delete Empty Folders" button, the array is mapped and dispatched to the universal `delete_items` Rust command.
- **`show_in_finder`**: Each individual row in the virtualized results list exposes a quick-action button triggering `show_in_finder`, instructing the OS natively to pop open the respective folder location for manual validation.

## Performance Optimizations

1. **DOM Virtualization (`@tanstack/react-virtual`)**:
   - The recursive empty folder scan can easily identify 15,000+ empty nested artifact fragments in environments like `node_modules` or `target`. The interface uses `useVirtualizer` anchored to `scrollRef`.
   - **Mechanism**: Calculates a continuous fixed-size overlay (`getVirtualItems()`) estimating 50px per row. Regardless of whether there are 10 results or 100,000 results, the React tree remains capped at rendering merely the visible intersecting nodes plus exactly `10` overscanned nodes for scroll stability.

2. **Render Offloading via Granular State Extraction**:
   - By structuring the component with numerous isolated selectors (e.g., `const scanning = useCleanStore(state => state.scanning)`), `zustand` guarantees that the component only rerenders when absolute necessary bits of state mutate, rather than thrashing uniformly. 

3. **Event Propagation Limits**:
   - Checkboxes and interactive buttons directly nested within virtual rows manually capture click events utilizing `e.stopPropagation()`. This strict encapsulation guarantees that rapidly masking/unmasking check boxes (which triggers `toggleSelection` store mutations) doesn't bubble up into expensive layout shifts or misfires on the parent row listeners.
