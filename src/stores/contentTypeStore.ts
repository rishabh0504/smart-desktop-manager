import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSettingsStore } from "./settingsStore";

export interface ContentGroup {
    category: String;
    paths: string[];
}

export interface ProgressEvent {
    scanned: number;
    duplicates_found: number;
    current_path: string;
    status: string;
    elapsed_ms: number;
}

interface ContentTypeState {
    scanQueue: string[];
    groups: ContentGroup[];
    scanning: boolean;
    progress: ProgressEvent | null;
    expandedCategories: Set<string>;

    addToQueue: (path: string) => void;
    removeFromQueue: (path: string) => void;
    clearQueue: () => void;
    startScan: () => Promise<void>;
    toggleCategory: (category: string) => void;
    reset: () => void;
}

export const useContentTypeStore = create<ContentTypeState>((set, get) => ({
    scanQueue: [],
    groups: [],
    scanning: false,
    progress: null,
    expandedCategories: new Set(),

    addToQueue: (path) => {
        if (!get().scanQueue.includes(path)) {
            set((state) => ({ scanQueue: [...state.scanQueue, path] }));
        }
    },

    removeFromQueue: (path) => {
        set((state) => ({ scanQueue: state.scanQueue.filter((p) => p !== path) }));
    },

    clearQueue: () => set({ scanQueue: [] }),

    toggleCategory: (category) => {
        set((state) => {
            const newExpanded = new Set(state.expandedCategories);
            if (newExpanded.has(category)) newExpanded.delete(category);
            else newExpanded.add(category);
            return { expandedCategories: newExpanded };
        });
    },

    reset: () => {
        set({ groups: [], scanning: false, progress: null, expandedCategories: new Set() });
    },

    startScan: async () => {
        const { scanQueue } = get();
        if (scanQueue.length === 0) return;

        set({ scanning: true, groups: [], progress: null, expandedCategories: new Set() });

        const unlisten = await listen<ProgressEvent>("content-progress", (event) => {
            set({ progress: event.payload });
        });

        const settings = useSettingsStore.getState().settings.content_search;

        try {
            const results = await invoke<ContentGroup[]>("find_content_by_category", {
                paths: scanQueue,
                settings,
            });
            set({ groups: results, scanning: false });
        } catch (err) {
            console.error("Content search failed:", err);
            set({ scanning: false });
        } finally {
            unlisten();
        }
    },
}));
