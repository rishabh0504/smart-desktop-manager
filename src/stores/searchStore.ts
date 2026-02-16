import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { SearchResult } from "@/types/explorer";

interface SearchState {
    results: SearchResult[];
    searching: boolean;
    searchId: string | null;
    query: string;

    // Actions
    startFileSearch: (root: string, query: string) => Promise<void>;
    startContentSearch: (root: string, query: string) => Promise<void>;
    cancelSearch: () => Promise<void>;
    clearResults: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
    results: [],
    searching: false,
    searchId: null,
    query: "",

    clearResults: () => set({ results: [], query: "" }),

    startFileSearch: async (root, query) => {
        const searchId = crypto.randomUUID();
        set({ results: [], searching: true, searchId, query });

        const unlisten = await listen<SearchResult>("search_result", (event) => {
            set((state) => ({
                results: [...state.results, event.payload],
            }));
        });

        const unlistenCompleted = await listen<string>("search_completed", (event) => {
            if (event.payload === searchId) {
                set({ searching: false });
                unlisten();
                unlistenCompleted();
            }
        });

        await invoke("start_file_search", { searchId, root, pattern: query });
    },

    startContentSearch: async (root, query) => {
        const searchId = crypto.randomUUID();
        set({ results: [], searching: true, searchId, query });

        const unlisten = await listen<SearchResult>("search_result", (event) => {
            set((state) => ({
                results: [...state.results, event.payload],
            }));
        });

        const unlistenCompleted = await listen<string>("search_completed", (event) => {
            if (event.payload === searchId) {
                set({ searching: false });
                unlisten();
                unlistenCompleted();
            }
        });

        await invoke("start_content_search", { searchId, root, pattern: query });
    },

    cancelSearch: async () => {
        const { searchId } = get();
        if (searchId) {
            await invoke("cancel_operation", { operation_id: searchId });
            set({ searching: false, searchId: null });
        }
    },
}));
