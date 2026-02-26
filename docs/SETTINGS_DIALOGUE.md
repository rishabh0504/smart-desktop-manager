# Settings Dialog View (`src/components/SettingsDialog.tsx`)

The `SettingsDialog` operates as the unified global configuration portal for the application. It provides users completely granular control over how the backend indexers discover files, how the frontend previews them, and how the entire application aesthetically presents itself natively.

## Component Overview
The interface mounts a large, fixed-height modal (`<DialogContent>`) featuring a classic split layout:
- **Left Sidebar**: A navigation menu switching the `activeSection` state between five operational modes: Explorer, Deduplication, Content Search, Clean View, and Appearance.
- **Right Content Area**: A scrollable panel that dynamically renders specific configuration inputs (`<ConfigSectionView />` or `<AppearanceSectionView />`) dependent strictly on the `activeSection`.

## State Management (`useSettingsStore`)
The core functionality relies on `useSettingsStore` allowing configuration choices to persist across sessions and immediately reflect across all active explorer tabs.
- The `settings` object is deeply nested into operational namespaces `settings: { explorer: {...}, dedupe: {...}, content_search: {...}, clean: {...}, theme: {...} }`.
- When a user toggles an option (e.g., Hidden Files), the frontend invokes `updateSettings(section, payload)`, mutating only that specific namespace without affecting unrelated states.

## Core Features and Sections

### 1. Unified Configuration Pipeline (`<ConfigSectionView />`)
To prevent massive duplication of code, all functional settings tabs (Explorer, Dedupe, Content Search, Clean) render the same generic `<ConfigSectionView section={activeSection} />` component. The component maps directly to the active `section` namespace in Zustand.

Features managed here include:
- **System Visibility**: Toggles for `show_hidden_files` and `show_system_files`. The backend implicitly respects these booleans when executing `read_dir_chunked` or `find_duplicates`.
- **Granular Previews**: A grid of `PreviewToggle` buttons (Images, Video, Audio, Text, Documents, Archives). Turning off "Images", for example, prevents the UI from attempting to mount `<img>` payloads in the Preview Drawer natively, saving significant RAM.
- **Exclusion Heuristics**: 
  - **Blocked Extensions**: Users can input formats (e.g., `.pak`, `.tmp`) to force the Rust backend to completely ignore matching files during its recursive directory walks. 
  - **Blocked Names**: Users can input exact strings (e.g., `node_modules`, `.git`, `LICENSE`) to prevent entire directories from being ingested into massive background tasks like dupe finding.

### 2. Layout Resizing (Explorer Only)
If the user is situated in the `"explorer"` active tab, a specialized section becomes visible modifying grid parameters.
- Users input numeric dimensions (Width/Height) restricting inputs to sensible min/max bounds natively using `Math.max(20, Math.min(400, Number(n)))` before sending it to `updateGridThumbnailSize`. Any active Explorer tab switched to "Grid mode" will dynamically read these precise pixel bounds resizing gracefully.

### 3. Application Theming (`<AppearanceSectionView />`)
A specialized dedicated component managing entire application aesthetics.
- **Dynamic Theming Engine**: Evaluates `theme.use_custom_color`.
  - If `false`, the UI defaults to the base generic Blue styling encoded in `globals.css`.
  - If `true`, the UI unlocks access to customized solid palettes (Rose, Emerald, Amber) and linear gradients (Ocean, Sunset).
- **CSS Injection Override**: This setting ultimately passes the `custom_color` string (e.g. `#10b981` or `linear-gradient(...)`) up to the `<MainLayout />` tree, overriding native CSS `--primary` root variables dynamically.

## Component Optimization details
- **Controlled Input Synchronization**: The Grid View sizing relies on specialized controlled state behaviors (`widthInput`, `heightInput`). These inputs pull values *once* upon modal `open`, operate completely detached on their own fast React states while the user types, and explicitly only sync back out into the global Zustand store entirely when native `onBlur` or `onKeyDown (Enter)` events occur. This stops the global memory tree from thrashing the rest of the app 30 times a second if the user holds down the backspace key inside the input box box natively.
