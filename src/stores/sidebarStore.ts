import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { Volume, TreeNode } from "@/types/explorer";

interface SidebarState {
    volumes: Volume[];
    favorites: string[];
    treeNodes: Record<string, TreeNode[]>; // path -> children
    expandedPaths: Set<string>;
    isCollapsed: boolean;
    loading: boolean;

    // Actions
    refreshVolumes: () => Promise<void>;
    toggleSidebar: () => void;
    addFavorite: (path: string) => void;
    removeFavorite: (path: string) => void;
    handlePathClick: (path: string) => void;
    toggleExpand: (path: string) => Promise<void>;
}

import { useExplorerStore } from "./explorerStore";

export const useSidebarStore = create<SidebarState>((set, get) => ({
    volumes: [],
    favorites: [],
    treeNodes: {},
    expandedPaths: new Set(),
    isCollapsed: false,
    loading: false,

    refreshVolumes: async () => {
        set({ loading: true });
        try {
            const volumes = await invoke<Volume[]>("list_volumes");
            set({ volumes, loading: false });
        } catch (err) {
            console.error("Failed to fetch volumes:", err);
            set({ loading: false });
        }
    },

    toggleSidebar: () => set((state) => ({ isCollapsed: !state.isCollapsed })),

    addFavorite: (path) => set((state) => ({
        favorites: state.favorites.includes(path) ? state.favorites : [...state.favorites, path]
    })),

    removeFavorite: (path) => set((state) => ({
        favorites: state.favorites.filter(p => p !== path)
    })),

    handlePathClick: (path) => {
        const { addTab } = useExplorerStore.getState();
        addTab(path);
    },

    toggleExpand: async (path) => {
        const { expandedPaths, treeNodes } = get();
        const nextExpanded = new Set(expandedPaths);

        if (nextExpanded.has(path)) {
            nextExpanded.delete(path);
            set({ expandedPaths: nextExpanded });
        } else {
            nextExpanded.add(path);
            set({ expandedPaths: nextExpanded });

            // Lazy load if not already loaded
            if (!treeNodes[path]) {
                try {
                    const nodes = await invoke<TreeNode[]>("get_tree_nodes", { path });
                    set(state => ({
                        treeNodes: { ...state.treeNodes, [path]: nodes }
                    }));
                } catch (err) {
                    console.error(`Failed to load tree path ${path}:`, err);
                }
            }
        }
    }
}));
