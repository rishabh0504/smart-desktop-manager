import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { FileEntry } from "@/types/explorer";

interface DeleteQueueState {
    queue: FileEntry[];
    addToQueue: (entry: FileEntry) => void;
    addManyToQueue: (entries: FileEntry[]) => void;
    removeFromQueue: (path: string) => void;
    clearQueue: () => void;
    /**
     * Prunes queue entries whose paths no longer exist on disk.
     * Call this when the app starts or when the delete-queue modal opens.
     * Fault-tolerant: if the backend call fails the queue is left intact.
     */
    validateQueue: () => Promise<void>;
}

export const useDeleteQueueStore = create<DeleteQueueState>()(
    persist(
        (set, get) => ({
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

            validateQueue: async () => {
                const { queue, removeFromQueue } = get();
                if (queue.length === 0) return;
                try {
                    const existingPaths = await invoke<string[]>("check_paths_exist", {
                        paths: queue.map((e) => e.path),
                    });
                    const existingSet = new Set(existingPaths);
                    // Remove every queue entry whose path is no longer on disk
                    queue.forEach((entry) => {
                        if (!existingSet.has(entry.path)) {
                            removeFromQueue(entry.path);
                        }
                    });
                } catch {
                    // If the backend is unavailable, keep the queue intact (safe default)
                }
            },
        }),
        {
            name: "deleteQueue_v1",
            // Only persist the queue array — actions are not serialisable
            partialize: (state) => ({ queue: state.queue }),
        }
    )
);
