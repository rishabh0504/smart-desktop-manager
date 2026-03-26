import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FileEntry } from "@/types/explorer";

interface FavouritesState {
    items: FileEntry[];
    addToQueue: (entry: FileEntry) => void;
    removeFromQueue: (path: string) => void;
    clearQueue: () => void;
    toggleQueue: (entry: FileEntry) => void;
    isInQueue: (path: string) => boolean;
}

export const useFavouritesStore = create<FavouritesState>()(
    persist(
        (set, get) => ({
            items: [],
            addToQueue: (entry) => {
                const { items } = get();
                if (!items.find((i) => i.path === entry.path)) {
                    set({ items: [...items, entry] });
                }
            },
            removeFromQueue: (path) => {
                set({ items: get().items.filter((i) => i.path !== path) });
            },
            clearQueue: () => set({ items: [] }),
            toggleQueue: (entry) => {
                const { items, addToQueue, removeFromQueue } = get();
                if (items.find((i) => i.path === entry.path)) {
                    removeFromQueue(entry.path);
                } else {
                    addToQueue(entry);
                }
            },
            isInQueue: (path) => {
                return get().items.some((i) => i.path === path);
            },
        }),
        {
            name: "favourites-storage",
        }
    )
);
