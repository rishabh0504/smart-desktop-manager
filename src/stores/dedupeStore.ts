import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";

export interface DuplicateGroup {
    hash: String;
    size: number;
    paths: string[];
}

export interface ProgressEvent {
    scanned: number;
    duplicates_found: number;
    current_path: string;
    status: string;
    elapsed_ms: number;
}

interface DedupeStore {
    scanning: boolean;
    progress: ProgressEvent | null;
    duplicates: DuplicateGroup[];
    selectedPaths: Set<string>;
    scanQueue: string[];
    expandedGroups: Set<string>;
    previewTarget: string | null;
    sameFolderOnly: boolean;

    // Actions
    setSameFolderOnly: (val: boolean) => void;
    addToQueue: (path: string) => void;
    removeFromQueue: (path: string) => void;
    startScan: () => Promise<void>;
    resetScan: () => void;
    toggleSelection: (path: string) => void;
    toggleGroup: (hash: string) => void;
    setPreviewTarget: (path: string | null) => void;
    selectDuplicates: (strategy: "all-but-newest" | "all-but-oldest" | "none", filteredGroups?: DuplicateGroup[]) => void;
    deleteSelected: () => Promise<void>;
}

export const useDedupeStore = create<DedupeStore>((set, get) => ({
    scanning: false,
    progress: null,
    duplicates: [],
    selectedPaths: new Set(),
    scanQueue: [],
    expandedGroups: new Set(),
    previewTarget: null,
    sameFolderOnly: false,

    setSameFolderOnly: (val: boolean) => set({ sameFolderOnly: val }),

    addToQueue: (path) => set(state => ({
        scanQueue: state.scanQueue.includes(path) ? state.scanQueue : [...state.scanQueue, path]
    })),

    removeFromQueue: (path) => set(state => ({
        scanQueue: state.scanQueue.filter(p => p !== path)
    })),

    startScan: async () => {
        const { scanQueue } = get();
        if (scanQueue.length === 0) {
            toast.error("Add at least one folder to scan");
            return;
        }

        set({
            scanning: true,
            duplicates: [],
            progress: null,
            selectedPaths: new Set(),
            expandedGroups: new Set(),
            previewTarget: null
        });
        // ... rest of startScan logic ...

        const DEDUPE_BATCH_MS = 150;
        const DEDUPE_BATCH_SIZE = 25;
        let buffer: DuplicateGroup[] = [];
        let flushTimer: ReturnType<typeof setTimeout> | null = null;

        const flush = () => {
            if (flushTimer) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
            if (buffer.length === 0) return;
            const batch = [...buffer];
            buffer = [];
            set(state => ({ duplicates: [...state.duplicates, ...batch] }));
        };

        const unlistenFound = await listen<DuplicateGroup>("duplicate-found", (event) => {
            buffer.push(event.payload);
            if (buffer.length >= DEDUPE_BATCH_SIZE) flush();
            else if (!flushTimer) flushTimer = setTimeout(flush, DEDUPE_BATCH_MS);
        });

        const unlistenProgress = await listen<ProgressEvent>("dedupe-progress", (event) => {
            set({ progress: event.payload });
        });

        try {
            const settings = (await import("./settingsStore")).useSettingsStore.getState().settings;
            await invoke("find_duplicates", { paths: scanQueue, settings: settings.dedupe });
            flush();
            set({ scanning: false });
        } catch (error) {
            console.error("Dedupe failed:", error);
            toast.error(`Dedupe failed: ${error}`);
            set({ scanning: false });
        } finally {
            flush();
            unlistenFound();
            unlistenProgress();
        }
    },

    resetScan: () => set({
        scanning: false,
        duplicates: [],
        progress: null,
        selectedPaths: new Set(),
        expandedGroups: new Set(),
        previewTarget: null
    }),

    toggleSelection: (path) => {
        set(state => {
            const newSelection = new Set(state.selectedPaths);
            if (newSelection.has(path)) newSelection.delete(path);
            else newSelection.add(path);
            return { selectedPaths: newSelection };
        });
    },

    toggleGroup: (hash) => {
        set(state => {
            const newExpanded = new Set(state.expandedGroups);
            if (newExpanded.has(hash)) newExpanded.delete(hash);
            else newExpanded.add(hash);
            return { expandedGroups: newExpanded };
        });
    },

    setPreviewTarget: (path) => set({ previewTarget: path }),

    selectDuplicates: (strategy, filteredGroups?: DuplicateGroup[]) => {
        const { duplicates } = get();
        const newSelection = new Set<string>();

        if (strategy === "none") {
            set({ selectedPaths: newSelection });
            return;
        }

        const groupsToProcess = filteredGroups || duplicates;

        // Simple strategy: select all but the first one in each group
        groupsToProcess.forEach(group => {
            group.paths.slice(1).forEach(path => newSelection.add(path));
        });

        set({ selectedPaths: newSelection });
    },

    deleteSelected: async () => {
        const { selectedPaths } = get();
        if (selectedPaths.size === 0) return;

        const confirm = await window.confirm(`Are you sure you want to delete ${selectedPaths.size} files?`);
        if (!confirm) return;

        try {
            const operationId = crypto.randomUUID();
            await invoke("delete_items", { operationId, paths: Array.from(selectedPaths) });
            toast.success(`${selectedPaths.size} files deleted`);
            // Refresh would be complex, maybe just mark as deleted or reset
            set({ duplicates: [], selectedPaths: new Set() });
        } catch (error) {
            toast.error(`Delete failed: ${error}`);
        }
    }
}));
