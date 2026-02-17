import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { DirectoryResponse, SortField, SortOrder, Tab } from "@/types/explorer";

interface ExplorerStore {
    tabs: Tab[];
    activeTabId: string | null;
    activeView: "explorer" | "dedupe";

    // Actions
    addTab: (path?: string, type?: Tab["type"]) => void;
    closeTab: (id: string) => void;
    setActiveTab: (id: string) => void;
    setActiveView: (view: "explorer" | "dedupe") => void;

    // Per-Tab Actions (require tabId)
    setPath: (tabId: string, path: string, updateHistory?: boolean, force?: boolean) => Promise<void>;
    loadMore: (tabId: string) => Promise<void>;
    toggleSelection: (tabId: string, path: string) => void;
    handleSelection: (tabId: string, path: string, isCmd: boolean, isShift: boolean) => void;
    clearSelection: (tabId: string) => void;
    setSort: (tabId: string, sortBy: SortField, order: SortOrder) => Promise<void>;
    refresh: (tabId: string) => Promise<void>;
    setViewMode: (tabId: string, mode: "list" | "grid") => void;
    goBack: (tabId: string) => void;
    goForward: (tabId: string) => void;
    goParent: (tabId: string) => void;
    toggleSort: (tabId: string, field: SortField) => void;

    // Clipboard (Global)
    clipboard: { paths: string[]; op: "copy" | "cut" } | null;
    copyToClipboard: (paths: string[]) => void;
    cutToClipboard: (paths: string[]) => void;
    pasteFromClipboard: (destinationPath: string) => Promise<void>;
}

const initialPanelState: Omit<Tab, "id" | "title" | "type"> = {
    path: "/",
    entries: [],
    total: 0,
    has_more: false,
    loading: false,
    sortBy: "name",
    order: "asc",
    selection: new Set(),
    isExpanded: true, // Tabs are always expanded
    viewMode: "list",
    history: [],
    currentIndex: -1,
    lastSelectedPath: null,
};

export const useExplorerStore = create<ExplorerStore>((set, get) => ({
    tabs: [],
    activeTabId: null,
    activeView: "explorer",

    clipboard: null,

    setActiveView: (activeView) => set({ activeView }),

    copyToClipboard: (paths) => set({ clipboard: { paths, op: "copy" } }),
    cutToClipboard: (paths) => set({ clipboard: { paths, op: "cut" } }),

    pasteFromClipboard: async (destinationPath) => {
        const { clipboard, refresh, tabs } = get();
        if (!clipboard || clipboard.paths.length === 0) return;

        const operationId = crypto.randomUUID();
        const command = clipboard.op === "copy" ? "batch_copy" : "batch_move";

        try {
            await invoke(command, {
                operationId,
                sources: clipboard.paths,
                destinationDir: destinationPath
            });

            // If move, clear clipboard
            if (clipboard.op === "cut") {
                set({ clipboard: null });
            }

            // Refresh all explorer tabs
            tabs.forEach(tab => {
                if (tab.type === "explorer") {
                    refresh(tab.id);
                }
            });

        } catch (error) {
            console.error("Paste failed:", error);
        }
    },

    addTab: (path = "/", type = "explorer") => {
        const { tabs, setActiveTab, setPath } = get();

        // Smart Open: If tab with this path exists, focus it
        const existingTab = tabs.find(t => t.path === path && t.type === type);
        if (existingTab) {
            setActiveTab(existingTab.id);
            return;
        }

        const newTab: Tab = {
            id: crypto.randomUUID(),
            title: path.split(/[/\\]/).pop() || "Home",
            type,
            ...initialPanelState,
            path
        };

        set(state => ({
            tabs: [...state.tabs, newTab],
            activeTabId: newTab.id
        }));

        // Initial load
        setPath(newTab.id, path);
    },

    closeTab: (id) => {
        set(state => {
            const index = state.tabs.findIndex(t => t.id === id);
            if (index === -1) return state;

            const newTabs = state.tabs.filter(t => t.id !== id);
            let newActiveId = state.activeTabId;

            if (state.activeTabId === id) {
                if (newTabs.length > 0) {
                    // Activate neighbor: try the one to the left FIRST, else the one on the right
                    const neighborIndex = index > 0 ? index - 1 : 0;
                    newActiveId = newTabs[neighborIndex].id;
                } else {
                    newActiveId = null;
                }
            }

            return { tabs: newTabs, activeTabId: newActiveId };
        });
    },

    setActiveTab: (id) => set({ activeTabId: id }),

    setPath: async (tabId, path, updateHistory = true, force = false) => {
        const state = get();
        const tab = state.tabs.find(t => t.id === tabId);
        if (!tab) return;

        // Don't update if it's the same path unless forced
        if (!force && tab.path === path && tab.entries.length > 0) return;

        // Optimistically update path and loading
        set(state => ({
            tabs: state.tabs.map(t => t.id === tabId ? { ...t, loading: true, path, title: path.split('/').pop() || path } : t)
        }));

        try {
            console.log("Fetching path:", path);
            const settings = (await import("./settingsStore")).useSettingsStore.getState().settings;
            console.log("Using settings:", settings);

            const response: DirectoryResponse = await invoke("read_dir_chunked", {
                path,
                offset: 0,
                limit: 1000,
                sortBy: tab.sortBy,
                order: tab.order,
                settings,
            });
            console.log("Response:", response);

            let nextHistory = tab.history;
            let nextIndex = tab.currentIndex;

            if (updateHistory) {
                nextHistory = tab.history.slice(0, tab.currentIndex + 1);
                nextHistory.push(path);
                nextIndex = nextHistory.length - 1;
            }

            set(state => ({
                tabs: state.tabs.map(t => t.id === tabId ? {
                    ...t,
                    entries: response.entries,
                    total: response.total,
                    has_more: response.has_more,
                    loading: false,
                    history: nextHistory,
                    currentIndex: nextIndex,
                    selection: new Set(),
                    lastSelectedPath: null
                } : t)
            }));
        } catch (error) {
            console.error(`Failed to load directory ${path}:`, error);
            set(state => ({
                tabs: state.tabs.map(t => t.id === tabId ? { ...t, loading: false } : t)
            }));
        }
    },

    loadMore: async (tabId) => {
        const tab = get().tabs.find(t => t.id === tabId);
        if (!tab || !tab.has_more || tab.loading) return;

        set(state => ({
            tabs: state.tabs.map(t => t.id === tabId ? { ...t, loading: true } : t)
        }));

        try {
            const settings = (await import("./settingsStore")).useSettingsStore.getState().settings;
            const response: DirectoryResponse = await invoke("read_dir_chunked", {
                path: tab.path,
                offset: tab.entries.length,
                limit: 1000,
                sortBy: tab.sortBy,
                order: tab.order,
                settings,
            });

            set(state => ({
                tabs: state.tabs.map(t => t.id === tabId ? {
                    ...t,
                    entries: [...t.entries, ...response.entries],
                    total: response.total,
                    has_more: response.has_more,
                    loading: false,
                } : t)
            }));
        } catch (error) {
            console.error("Load more failed:", error);
            set(state => ({
                tabs: state.tabs.map(t => t.id === tabId ? { ...t, loading: false } : t)
            }));
        }
    },

    setSort: async (tabId, sortBy, order) => {
        set(state => ({
            tabs: state.tabs.map(t => t.id === tabId ? { ...t, sortBy, order, loading: true } : t)
        }));
        await get().refresh(tabId);
    },

    refresh: async (tabId) => {
        const tab = get().tabs.find(t => t.id === tabId);
        if (tab) {
            await get().setPath(tabId, tab.path, false, true);
        }
    },

    toggleSelection: (tabId, path) => {
        set(state => ({
            tabs: state.tabs.map(t => t.id === tabId ? {
                ...t,
                selection: (() => {
                    const newSet = new Set(t.selection);
                    if (newSet.has(path)) newSet.delete(path);
                    else newSet.add(path);
                    return newSet;
                })(),
                lastSelectedPath: path
            } : t)
        }));
    },

    handleSelection: (tabId, path, isCmd, isShift) => {
        set(state => {
            const tab = state.tabs.find(t => t.id === tabId);
            if (!tab) return state;

            const newSelection = new Set(tab.selection);
            let nextLastSelected = path;

            if (isShift && tab.lastSelectedPath) {
                const entries = tab.entries;
                const startIdx = entries.findIndex(e => e.path === tab.lastSelectedPath);
                const endIdx = entries.findIndex(e => e.path === path);

                if (startIdx !== -1 && endIdx !== -1) {
                    const [low, high] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
                    newSelection.clear();
                    for (let i = low; i <= high; i++) {
                        newSelection.add(entries[i].path);
                    }
                    nextLastSelected = tab.lastSelectedPath;
                }
            } else if (isCmd) {
                if (newSelection.has(path)) newSelection.delete(path);
                else newSelection.add(path);
            } else {
                newSelection.clear();
                newSelection.add(path);
            }

            return {
                tabs: state.tabs.map(t => t.id === tabId ? {
                    ...t,
                    selection: newSelection,
                    lastSelectedPath: nextLastSelected
                } : t)
            };
        });
    },

    clearSelection: (tabId) => {
        set(state => ({
            tabs: state.tabs.map(t => t.id === tabId ? { ...t, selection: new Set(), lastSelectedPath: null } : t)
        }));
    },

    setViewMode: (tabId, mode) => {
        set(state => ({
            tabs: state.tabs.map(t => t.id === tabId ? { ...t, viewMode: mode } : t)
        }));
    },

    goBack: (tabId) => {
        const tab = get().tabs.find(t => t.id === tabId);
        if (tab && tab.currentIndex > 0) {
            const nextIndex = tab.currentIndex - 1;
            const targetPath = tab.history[nextIndex];
            set(state => ({
                tabs: state.tabs.map(t => t.id === tabId ? { ...t, currentIndex: nextIndex } : t)
            }));
            get().setPath(tabId, targetPath, false);
        }
    },

    goForward: (tabId) => {
        const tab = get().tabs.find(t => t.id === tabId);
        if (tab && tab.currentIndex < tab.history.length - 1) {
            const nextIndex = tab.currentIndex + 1;
            const targetPath = tab.history[nextIndex];
            set(state => ({
                tabs: state.tabs.map(t => t.id === tabId ? { ...t, currentIndex: nextIndex } : t)
            }));
            get().setPath(tabId, targetPath, false);
        }
    },

    goParent: (tabId) => {
        const tab = get().tabs.find(t => t.id === tabId);
        if (tab) {
            const pathParts = tab.path.split("/").filter(Boolean);
            if (pathParts.length > 0) {
                pathParts.pop();
                const parentPath = "/" + pathParts.join("/");
                get().setPath(tabId, parentPath);
            }
        }
    },

    toggleSort: (tabId, field) => {
        const tab = get().tabs.find(t => t.id === tabId);
        if (tab) {
            let nextOrder: SortOrder = "asc";
            if (tab.sortBy === field) {
                nextOrder = tab.order === "asc" ? "desc" : "asc";
            }
            // Use setSort to update state + refresh
            get().setSort(tabId, field, nextOrder);
        }
    },
}));
