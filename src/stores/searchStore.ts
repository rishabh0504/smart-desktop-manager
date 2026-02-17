import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { SearchResult } from "@/types/explorer";

const BATCH_FLUSH_MS = 120;
const BATCH_FLUSH_SIZE = 80;

interface SearchState {
    results: SearchResult[];
    searching: boolean;
    searchId: string | null;
    query: string;

    startFileSearch: (root: string, query: string, options?: { max_depth?: number; result_limit?: number }) => Promise<void>;
    startContentSearch: (root: string, query: string, options?: { max_depth?: number; result_limit?: number }) => Promise<void>;
    cancelSearch: () => Promise<void>;
    clearResults: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
    results: [],
    searching: false,
    searchId: null,
    query: "",

    clearResults: () => set({ results: [], query: "" }),

    startFileSearch: async (root, query, options) => {
        const searchId = crypto.randomUUID();
        set({ results: [], searching: true, searchId, query });

        let buffer: SearchResult[] = [];
        let flushTimer: ReturnType<typeof setTimeout> | null = null;

        const flush = () => {
            if (flushTimer) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
            if (buffer.length === 0) return;
            const batch = [...buffer];
            buffer = [];
            set((state) => ({ results: [...state.results, ...batch] }));
        };

        const unlisten = await listen<SearchResult>("search_result", (event) => {
            buffer.push(event.payload);
            if (buffer.length >= BATCH_FLUSH_SIZE) {
                flush();
            } else if (!flushTimer) {
                flushTimer = setTimeout(flush, BATCH_FLUSH_MS);
            }
        });

        const unlistenCompleted = await listen<string>("search_completed", (event) => {
            if (event.payload === searchId) {
                flush();
                set({ searching: false });
                unlisten();
                unlistenCompleted();
            }
        });

        await invoke("start_file_search", {
            searchId,
            root,
            pattern: query,
            max_depth: options?.max_depth ?? null,
            result_limit: options?.result_limit ?? null,
        });
    },

    startContentSearch: async (root, query, options) => {
        const searchId = crypto.randomUUID();
        set({ results: [], searching: true, searchId, query });

        let buffer: SearchResult[] = [];
        let flushTimer: ReturnType<typeof setTimeout> | null = null;

        const flush = () => {
            if (flushTimer) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
            if (buffer.length === 0) return;
            const batch = [...buffer];
            buffer = [];
            set((state) => ({ results: [...state.results, ...batch] }));
        };

        const unlisten = await listen<SearchResult>("search_result", (event) => {
            buffer.push(event.payload);
            if (buffer.length >= BATCH_FLUSH_SIZE) {
                flush();
            } else if (!flushTimer) {
                flushTimer = setTimeout(flush, BATCH_FLUSH_MS);
            }
        });

        const unlistenCompleted = await listen<string>("search_completed", (event) => {
            if (event.payload === searchId) {
                flush();
                set({ searching: false });
                unlisten();
                unlistenCompleted();
            }
        });

        await invoke("start_content_search", {
            searchId,
            root,
            pattern: query,
            max_depth: options?.max_depth ?? null,
            result_limit: options?.result_limit ?? null,
        });
    },

    cancelSearch: async () => {
        const { searchId } = get();
        if (searchId) {
            await invoke("cancel_operation", { operation_id: searchId });
            set({ searching: false, searchId: null });
        }
    },
}));
