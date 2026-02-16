import { create } from "zustand";
import { FileEntry } from "@/types/explorer";

export interface ListItem extends FileEntry { }

interface ListStore {
    items: ListItem[];
    addItem: (item: FileEntry) => void;
    removeItem: (path: string) => void;
    clearList: () => void;
    setItems: (items: ListItem[]) => void;
}

export const useListStore = create<ListStore>((set) => ({
    items: [],
    addItem: (item) => set((state) => {
        if (state.items.find((i) => i.path === item.path)) return state;
        return { items: [...state.items, item] };
    }),
    removeItem: (path) => set((state) => ({
        items: state.items.filter((i) => i.path !== path)
    })),
    clearList: () => set({ items: [] }),
    setItems: (items) => set({ items }),
}));
