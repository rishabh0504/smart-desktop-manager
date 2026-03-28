import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import {
    defaultKeeperPath,
    pickNewestPathIndex,
    pickOldestPathIndex,
    removeSinglePathFromDuplicateGroups,
} from "@/lib/dedupeUtils";

export interface DuplicateGroup {
    hash: string;
    size: number;
    paths: string[];
    modified_times: number[];
}

export interface ProgressEvent {
    scanned: number;
    duplicates_found: number;
    current_path: string;
    status: string;
    percent: number;
    phase: number;
    total_files: number;
    elapsed_ms: number;
}

export interface DeleteBatchProgress {
    processed: number;
    total: number;
    current: string;
}

interface BatchItemCompletedPayload {
    operation_id: string;
    path: string;
}

interface BatchProgressPayload {
    operation_id: string;
    current_item: string;
    processed_items: number;
    total_items: number;
    progress: number;
}

function mergeKeepersForGroups(
    prev: Record<string, string>,
    groups: DuplicateGroup[]
): Record<string, string> {
    const next = { ...prev };
    const valid = new Set<string>();
    for (const g of groups) {
        const h = String(g.hash);
        valid.add(h);
        const keeper = next[h];
        if (!keeper || !g.paths.includes(keeper)) {
            next[h] = defaultKeeperPath(g);
        }
    }
    for (const k of Object.keys(next)) {
        if (!valid.has(k)) delete next[k];
    }
    return next;
}

interface DedupeStore {
    scanning: boolean;
    progress: ProgressEvent | null;
    duplicates: DuplicateGroup[];
    selectedPaths: Set<string>;
    /** Per hash group: full path of the file to keep (others are delete candidates). */
    keeperByHash: Record<string, string>;
    scanQueue: string[];
    expandedGroups: Set<string>;
    previewTarget: string | null;
    sameFolderOnly: boolean;
    /** Move-to-Trash batch in progress (fault-tolerant incremental updates). */
    deleting: boolean;
    deleteBatchProgress: DeleteBatchProgress | null;

    setSameFolderOnly: (val: boolean) => void;
    addToQueue: (path: string) => void;
    removeFromQueue: (path: string) => void;
    startScan: () => Promise<void>;
    resetScan: () => void;
    toggleSelection: (path: string) => void;
    toggleGroup: (hash: string) => void;
    setPreviewTarget: (path: string | null) => void;
    setGroupKeeper: (hash: string, keeperPath: string, groupPaths: string[]) => void;
    selectDuplicates: (strategy: "all-but-newest" | "all-but-oldest" | "none", filteredGroups?: DuplicateGroup[]) => void;
    deleteSelected: () => Promise<void>;
}

export const useDedupeStore = create<DedupeStore>((set, get) => ({
    scanning: false,
    progress: null,
    duplicates: [],
    selectedPaths: new Set(),
    keeperByHash: {},
    scanQueue: [],
    expandedGroups: new Set(),
    previewTarget: null,
    sameFolderOnly: false,
    deleting: false,
    deleteBatchProgress: null,

    setSameFolderOnly: (val: boolean) => set({ sameFolderOnly: val }),

    addToQueue: (path) =>
        set((state) => ({
            scanQueue: state.scanQueue.includes(path) ? state.scanQueue : [...state.scanQueue, path],
        })),

    removeFromQueue: (path) =>
        set((state) => ({
            scanQueue: state.scanQueue.filter((p) => p !== path),
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
            keeperByHash: {},
            expandedGroups: new Set(),
            previewTarget: null,
        });

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
            set((state) => {
                const duplicates = [...state.duplicates, ...batch];
                return {
                    duplicates,
                    keeperByHash: mergeKeepersForGroups(state.keeperByHash, duplicates),
                };
            });
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

    resetScan: () =>
        set({
            scanning: false,
            duplicates: [],
            progress: null,
            selectedPaths: new Set(),
            keeperByHash: {},
            expandedGroups: new Set(),
            previewTarget: null,
            deleting: false,
            deleteBatchProgress: null,
        }),

    toggleSelection: (path) => {
        set((state) => {
            const newSelection = new Set(state.selectedPaths);
            if (newSelection.has(path)) newSelection.delete(path);
            else newSelection.add(path);
            return { selectedPaths: newSelection };
        });
    },

    toggleGroup: (hash) => {
        set((state) => {
            const newExpanded = new Set(state.expandedGroups);
            if (newExpanded.has(hash)) newExpanded.delete(hash);
            else newExpanded.add(hash);
            return { expandedGroups: newExpanded };
        });
    },

    setPreviewTarget: (path) => set({ previewTarget: path }),

    setGroupKeeper: (hash, keeperPath, groupPaths) => {
        set((state) => {
            if (!groupPaths.includes(keeperPath)) return state;
            const keeperByHash = { ...state.keeperByHash, [hash]: keeperPath };
            const newSel = new Set(state.selectedPaths);
            for (const p of groupPaths) {
                if (p === keeperPath) newSel.delete(p);
                else newSel.add(p);
            }
            return { keeperByHash, selectedPaths: newSel };
        });
    },

    selectDuplicates: (strategy, filteredGroups) => {
        const { duplicates } = get();
        const newSelection = new Set<string>();
        const groupsToProcess = filteredGroups || duplicates;
        const keeperByHash = { ...get().keeperByHash };

        if (strategy === "none") {
            set({ selectedPaths: newSelection });
            return;
        }

        if (strategy === "all-but-newest") {
            groupsToProcess.forEach((group) => {
                if (group.paths.length <= 1) return;
                const h = String(group.hash);
                const idx = pickNewestPathIndex(group);
                keeperByHash[h] = group.paths[idx];
                group.paths.forEach((path, i) => {
                    if (i !== idx) newSelection.add(path);
                });
            });
        } else if (strategy === "all-but-oldest") {
            groupsToProcess.forEach((group) => {
                if (group.paths.length <= 1) return;
                const h = String(group.hash);
                const idx = pickOldestPathIndex(group);
                keeperByHash[h] = group.paths[idx];
                group.paths.forEach((path, i) => {
                    if (i !== idx) newSelection.add(path);
                });
            });
        }

        set({ selectedPaths: newSelection, keeperByHash });
    },

    deleteSelected: async () => {
        const { selectedPaths } = get();
        if (selectedPaths.size === 0) return;

        const confirm = await window.confirm(`Move ${selectedPaths.size} file(s) to Trash?`);
        if (!confirm) return;

        const operationId = crypto.randomUUID();
        const pathsToDelete = Array.from(selectedPaths);
        const total = pathsToDelete.length;

        let successCount = 0;

        set({
            deleting: true,
            deleteBatchProgress: { processed: 0, total, current: "" },
        });

        const unlistenItem = await listen<BatchItemCompletedPayload>("batch_item_completed", (event) => {
            const p = event.payload;
            if (p.operation_id !== operationId) return;
            successCount++;
            set((state) => {
                const updatedDuplicates = removeSinglePathFromDuplicateGroups(state.duplicates, p.path);
                const newSel = new Set(state.selectedPaths);
                newSel.delete(p.path);
                return {
                    duplicates: updatedDuplicates,
                    selectedPaths: newSel,
                    keeperByHash: mergeKeepersForGroups(state.keeperByHash, updatedDuplicates),
                };
            });
        });

        const unlistenProgress = await listen<BatchProgressPayload>("batch_progress", (event) => {
            const d = event.payload;
            if (d.operation_id !== operationId) return;
            set({
                deleteBatchProgress: {
                    processed: d.processed_items,
                    total: d.total_items,
                    current: d.current_item,
                },
            });
        });

        try {
            await invoke("delete_items", { operationId, paths: pathsToDelete });
            toast.success(`${successCount} file(s) moved to Trash`);
        } catch {
            const failedCount = pathsToDelete.length - successCount;
            if (successCount > 0 && failedCount > 0) {
                toast.warning(`Moved ${successCount} file(s) to Trash; ${failedCount} failed.`);
            } else if (failedCount > 0 && successCount === 0) {
                toast.error(`Could not move items to Trash (${failedCount} failed).`);
            } else {
                toast.error("Move to Trash failed.");
            }
        } finally {
            unlistenItem();
            unlistenProgress();
            set({ deleting: false, deleteBatchProgress: null });
        }
    },
}));
