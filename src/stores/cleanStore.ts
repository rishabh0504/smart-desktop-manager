import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { EmptyFolder } from "@/types/explorer";

export interface CleanProgressEvent {
    scanned_folders: number;
    empty_folders_found: number;
    current_path: string;
    status: string;
    elapsed_ms: number;
}

interface CleanStore {
    scanning: boolean;
    progress: CleanProgressEvent | null;
    findings: EmptyFolder[];
    selectedPaths: Set<string>;
    scanQueue: string[];

    // Actions
    addToQueue: (path: string) => void;
    removeFromQueue: (path: string) => void;
    startScan: () => Promise<void>;
    resetScan: () => void;
    toggleSelection: (path: string) => void;
    deleteSelected: () => Promise<void>;
    selectAll: () => void;
    selectNone: () => void;
}

export const useCleanStore = create<CleanStore>((set, get) => ({
    scanning: false,
    progress: null,
    findings: [],
    selectedPaths: new Set(),
    scanQueue: [],

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
            findings: [],
            progress: null,
            selectedPaths: new Set(),
        });

        const unlistenProgress = await listen<CleanProgressEvent>("clean-progress", (event) => {
            set({ progress: event.payload });
        });

        try {
            const settings = (await import("./settingsStore")).useSettingsStore.getState().settings;
            const results = await invoke<EmptyFolder[]>("find_empty_folders", {
                paths: scanQueue,
                settings: settings.clean
            });
            set({ findings: results, scanning: false });
        } catch (error) {
            console.error("Clean scan failed:", error);
            toast.error(`Scan failed: ${error}`);
            set({ scanning: false });
        } finally {
            unlistenProgress();
        }
    },

    resetScan: () => set({
        scanning: false,
        findings: [],
        progress: null,
        selectedPaths: new Set()
    }),

    toggleSelection: (path) => {
        set(state => {
            const newSelection = new Set(state.selectedPaths);
            if (newSelection.has(path)) newSelection.delete(path);
            else newSelection.add(path);
            return { selectedPaths: newSelection };
        });
    },

    selectAll: () => {
        const { findings } = get();
        set({ selectedPaths: new Set(findings.map(f => f.path)) });
    },

    selectNone: () => {
        set({ selectedPaths: new Set() });
    },

    deleteSelected: async () => {
        const { selectedPaths } = get();
        if (selectedPaths.size === 0) return;

        const confirm = await window.confirm(`Are you sure you want to delete ${selectedPaths.size} empty folders? This will also recursively clean any parents that become empty.`);
        if (!confirm) return;

        try {
            await invoke("delete_empty_folders", { paths: Array.from(selectedPaths) });
            toast.success(`${selectedPaths.size} empty folders deleted`);
            // Refresh scan after deletion to show new state (or just clear findings)
            set({ findings: [], selectedPaths: new Set() });
            // Ideally we'd re-trigger startScan() but we'll let the user decide.
        } catch (error) {
            toast.error(`Delete failed: ${error}`);
        }
    }
}));
