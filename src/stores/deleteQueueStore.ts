import { create } from "zustand";
import { FileEntry } from "@/types/explorer";

interface DeleteQueueState {
    queue: FileEntry[];
    addToQueue: (entry: FileEntry) => void;
    addManyToQueue: (entries: FileEntry[]) => void;
    removeFromQueue: (path: string) => void;
    clearQueue: () => void;
}

export const useDeleteQueueStore = create<DeleteQueueState>((set) => ({
    queue: [],

    addToQueue: (entry) =>
        set((state) => {
            if (state.queue.some((e) => e.path === entry.path)) return state;
            return { queue: [...state.queue, { ...entry }] };
        }),

    addManyToQueue: (entries) =>
        set((state) => {
            const paths = new Set(state.queue.map((e) => e.path));
            const toAdd = entries.filter((e) => !paths.has(e.path));
            return { queue: [...state.queue, ...toAdd] };
        }),

    removeFromQueue: (path) =>
        set((state) => ({
            queue: state.queue.filter((e) => e.path !== path),
        })),

    clearQueue: () => set({ queue: [] }),
}));
