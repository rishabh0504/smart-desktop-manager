import { create } from "zustand";
import { FileEntry } from "@/types/explorer";

interface PreviewState {
    target: FileEntry | null;
    isOpen: boolean;
    volume: number;
    isMuted: boolean;
    rotation: number;

    // Actions
    openPreview: (target: FileEntry) => void;
    closePreview: () => void;
    setVolume: (volume: number) => void;
    setIsMuted: (isMuted: boolean) => void;
    setRotation: (rotation: number) => void;
    resetRotation: () => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
    target: null,
    isOpen: false,
    volume: 1,
    isMuted: true,
    rotation: 0,

    openPreview: (target) => set({ target, isOpen: true, rotation: 0 }),
    closePreview: () => set({ target: null, isOpen: false, volume: 1, isMuted: true, rotation: 0 }),
    setVolume: (volume) => set({ volume }),
    setIsMuted: (isMuted) => set({ isMuted }),
    setRotation: (rotation) => set({ rotation }),
    resetRotation: () => set({ rotation: 0 }),
}));
