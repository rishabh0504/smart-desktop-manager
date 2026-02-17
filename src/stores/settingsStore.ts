import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { ExplorerSettings, PreviewSettings } from "@/types/explorer";
import { useExplorerStore } from "./explorerStore";

const GRID_THUMB_WIDTH_KEY = "sdm-grid-thumb-width";
const GRID_THUMB_HEIGHT_KEY = "sdm-grid-thumb-height";
const GRID_THUMB_DEFAULT = 30;

function getGridThumbFromStorage(): { width: number; height: number } {
    if (typeof window === "undefined") return { width: GRID_THUMB_DEFAULT, height: GRID_THUMB_DEFAULT };
    const w = Number(localStorage.getItem(GRID_THUMB_WIDTH_KEY));
    const h = Number(localStorage.getItem(GRID_THUMB_HEIGHT_KEY));
    return {
        width: Number.isFinite(w) && w > 0 ? w : GRID_THUMB_DEFAULT,
        height: Number.isFinite(h) && h > 0 ? h : GRID_THUMB_DEFAULT,
    };
}

interface SettingsState {
    settings: ExplorerSettings;
    loading: boolean;
    grid_thumbnail_width: number;
    grid_thumbnail_height: number;

    loadSettings: () => Promise<void>;
    updateSettings: (settings: Partial<ExplorerSettings>) => Promise<void>;
    updatePreviewSettings: (preview: Partial<PreviewSettings>) => Promise<void>;
    updateGridThumbnailSize: (width: number, height: number) => void;
    addBlockedExtension: (ext: string) => Promise<void>;
    removeBlockedExtension: (ext: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
    settings: {
        preview_enabled: {
            image: true,
            video: true,
            audio: true,
            text: true,
            pdf: true,
            archive: false,
            other: true,
        },
        show_hidden_files: false,
        show_system_files: false,
        blocked_extensions: ["iso", "tmp"],
        setup_completed: true,
    },
    loading: false,
    grid_thumbnail_width: getGridThumbFromStorage().width,
    grid_thumbnail_height: getGridThumbFromStorage().height,

    loadSettings: async () => {
        set({ loading: true });
        try {
            const settings = await invoke<ExplorerSettings>("load_settings");
            const grid = getGridThumbFromStorage();
            set({ settings, loading: false, grid_thumbnail_width: grid.width, grid_thumbnail_height: grid.height });
        } catch (err) {
            console.error("Failed to load settings:", err);
            const grid = getGridThumbFromStorage();
            set({ loading: false, grid_thumbnail_width: grid.width, grid_thumbnail_height: grid.height });
        }
    },

    updateGridThumbnailSize: (width, height) => {
        const w = Number.isFinite(width) && width > 0 ? Math.round(width) : GRID_THUMB_DEFAULT;
        const h = Number.isFinite(height) && height > 0 ? Math.round(height) : GRID_THUMB_DEFAULT;
        if (typeof window !== "undefined") {
            localStorage.setItem(GRID_THUMB_WIDTH_KEY, String(w));
            localStorage.setItem(GRID_THUMB_HEIGHT_KEY, String(h));
        }
        set({ grid_thumbnail_width: w, grid_thumbnail_height: h });
    },

    updateSettings: async (newSettings) => {
        const updated = { ...get().settings, ...newSettings };
        set({ settings: updated });

        try {
            await invoke("save_settings", { settings: updated });
            // Trigger refresh in explorer lanes
            const explorer = useExplorerStore.getState();
            explorer.refresh("left");
            explorer.refresh("right");
        } catch (err) {
            console.error("Failed to save settings:", err);
        }
    },

    updatePreviewSettings: async (preview) => {
        const updatedPreview = { ...get().settings.preview_enabled, ...preview };
        await get().updateSettings({ preview_enabled: updatedPreview });
    },

    addBlockedExtension: async (ext) => {
        const normalized = ext.toLowerCase().replace('.', '');
        if (!get().settings.blocked_extensions.includes(normalized)) {
            const updated = [...get().settings.blocked_extensions, normalized];
            await get().updateSettings({ blocked_extensions: updated });
        }
    },

    removeBlockedExtension: async (ext) => {
        const updated = get().settings.blocked_extensions.filter(e => e !== ext);
        await get().updateSettings({ blocked_extensions: updated });
    }
}));
