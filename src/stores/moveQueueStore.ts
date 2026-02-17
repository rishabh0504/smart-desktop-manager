import { create } from "zustand";
import { FileEntry } from "@/types/explorer";

const STORAGE_KEY = "super-explorer-move-queues";

export interface MoveQueueItem {
    id: string;
    name: string;
    folderPath: string;
    items: FileEntry[];
}

function loadFromStorage(): MoveQueueItem[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as MoveQueueItem[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveToStorage(queues: MoveQueueItem[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(queues));
    } catch (e) {
        console.warn("Failed to save move queues to localStorage", e);
    }
}

interface MoveQueueState {
    openManager: boolean;
    setOpenManager: (open: boolean) => void;
    queues: MoveQueueItem[];
    addQueue: (name: string, folderPath: string) => string;
    updateQueue: (id: string, updates: { name?: string; folderPath?: string }) => void;
    removeQueue: (id: string) => void;
    addToQueue: (queueId: string, entry: FileEntry) => void;
    removeFromQueue: (queueId: string, path: string) => void;
    moveItemToQueue: (fromQueueId: string, toQueueId: string, entryPath: string) => void;
    clearQueue: (queueId: string) => void;
    getQueue: (id: string) => MoveQueueItem | undefined;
    getTotalItemCount: () => number;
    findQueuesContainingPath: (path: string) => string[];
}

export const useMoveQueueStore = create<MoveQueueState>((set, get) => ({
    openManager: false,
    setOpenManager: (open) => set({ openManager: open }),
    queues: loadFromStorage(),

    addQueue: (name, folderPath) => {
        const id = crypto.randomUUID();
        set((state) => {
            const next = [...state.queues, { id, name, folderPath, items: [] }];
            saveToStorage(next);
            return { queues: next };
        });
        return id;
    },

    updateQueue: (id, updates) =>
        set((state) => {
            const next = state.queues.map((q) =>
                q.id === id ? { ...q, ...updates } : q
            );
            saveToStorage(next);
            return { queues: next };
        }),

    removeQueue: (id) =>
        set((state) => {
            const next = state.queues.filter((q) => q.id !== id);
            saveToStorage(next);
            return { queues: next };
        }),

    addToQueue: (queueId, entry) =>
        set((state) => {
            const next = state.queues.map((q) => {
                if (q.id !== queueId) return q;
                if (q.items.some((e) => e.path === entry.path)) return q;
                return { ...q, items: [...q.items, { ...entry }] };
            });
            saveToStorage(next);
            return { queues: next };
        }),

    removeFromQueue: (queueId, path) =>
        set((state) => {
            const next = state.queues.map((q) =>
                q.id === queueId
                    ? { ...q, items: q.items.filter((e) => e.path !== path) }
                    : q
            );
            saveToStorage(next);
            return { queues: next };
        }),

    moveItemToQueue: (fromQueueId, toQueueId, entryPath) => {
        const state = get();
        const fromQueue = state.queues.find((q) => q.id === fromQueueId);
        if (!fromQueue) return;
        const entry = fromQueue.items.find((e) => e.path === entryPath);
        if (!entry || fromQueueId === toQueueId) return;
        get().removeFromQueue(fromQueueId, entryPath);
        get().addToQueue(toQueueId, entry);
    },

    clearQueue: (queueId) =>
        set((state) => {
            const next = state.queues.map((q) =>
                q.id === queueId ? { ...q, items: [] } : q
            );
            saveToStorage(next);
            return { queues: next };
        }),

    getQueue: (id) => get().queues.find((q) => q.id === id),

    getTotalItemCount: () =>
        get().queues.reduce((sum, q) => sum + q.items.length, 0),

    findQueuesContainingPath: (path) =>
        get()
            .queues.filter((q) => q.items.some((e) => e.path === path))
            .map((q) => q.id),
}));
