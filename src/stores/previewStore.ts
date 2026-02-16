import { create } from "zustand";
import { FileEntry } from "@/types/explorer";

interface PreviewState {
    target: FileEntry | null;
    isOpen: boolean;

    // Actions
    openPreview: (target: FileEntry) => void;
    closePreview: () => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
    target: null,
    isOpen: false,

    openPreview: (target) => set({ target, isOpen: true }),
    closePreview: () => set({ target: null, isOpen: false }),
}));
