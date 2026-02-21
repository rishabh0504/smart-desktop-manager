import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { AppSettings, ConfigSection, PreviewSettings } from "@/types/explorer";
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

const DEFAULT_CONFIG: ConfigSection = {
    preview_enabled: {
        image: true,
        video: true,
        audio: true,
        text: true,
        document: true,
        archive: false,
        other: true,
    },
    show_hidden_files: false,
    show_system_files: false,
    blocked_extensions: ["iso", "tmp"],
};

interface SettingsState {
    settings: AppSettings;
    loading: boolean;
    grid_thumbnail_width: number;
    grid_thumbnail_height: number;

    loadSettings: () => Promise<void>;
    updateSettings: (section: "explorer" | "dedupe" | "content_search" | "clean", values: Partial<ConfigSection>) => Promise<void>;
    updatePreviewSettings: (section: "explorer" | "dedupe" | "content_search" | "clean", preview: Partial<PreviewSettings>) => Promise<void>;
    updateGridThumbnailSize: (width: number, height: number) => void;
    addBlockedExtension: (section: "explorer" | "dedupe" | "content_search" | "clean", ext: string) => Promise<void>;
    removeBlockedExtension: (section: "explorer" | "dedupe" | "content_search" | "clean", ext: string) => Promise<void>;
    updateTheme: (values: Partial<AppSettings["theme"]>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
    settings: {
        explorer: { ...DEFAULT_CONFIG },
        dedupe: { ...DEFAULT_CONFIG },
        content_search: { ...DEFAULT_CONFIG },
        clean: { ...DEFAULT_CONFIG },
        theme: {
            use_custom_color: false,
            custom_color: "#3b82f6",
        },
        setup_completed: true,
    },
    loading: false,
    grid_thumbnail_width: getGridThumbFromStorage().width,
    grid_thumbnail_height: getGridThumbFromStorage().height,

    loadSettings: async () => {
        set({ loading: true });
        try {
            const settings = await invoke<AppSettings>("load_settings");
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

    updateSettings: async (section, values) => {
        const currentSection = get().settings[section];
        const updatedSection = { ...currentSection, ...values };
        const updatedSettings = { ...get().settings, [section]: updatedSection };

        set({ settings: updatedSettings });

        try {
            await invoke("save_settings", { settings: updatedSettings });
            if (section === "explorer") {
                const explorer = useExplorerStore.getState();
                explorer.refresh("left");
                explorer.refresh("right");
            }
        } catch (err) {
            console.error("Failed to save settings:", err);
        }
    },

    updatePreviewSettings: async (section, preview) => {
        const currentPreview = get().settings[section].preview_enabled;
        const updatedPreview = { ...currentPreview, ...preview };
        await get().updateSettings(section, { preview_enabled: updatedPreview });
    },

    addBlockedExtension: async (section, ext) => {
        const normalized = ext.toLowerCase().replace('.', '');
        const currentExtensions = get().settings[section].blocked_extensions;
        if (!currentExtensions.includes(normalized)) {
            const updated = [...currentExtensions, normalized];
            await get().updateSettings(section, { blocked_extensions: updated });
        }
    },

    removeBlockedExtension: async (section, ext) => {
        const currentExtensions = get().settings[section].blocked_extensions;
        const updated = currentExtensions.filter(e => e !== ext);
        await get().updateSettings(section, { blocked_extensions: updated });
    },

    updateTheme: async (values) => {
        const currentTheme = get().settings.theme;
        const updatedTheme = { ...currentTheme, ...values };
        const updatedSettings = { ...get().settings, theme: updatedTheme };

        set({ settings: updatedSettings });

        try {
            await invoke("save_settings", { settings: updatedSettings });
            // Apply theme logic will be handled in MainLayout or a hook
        } catch (err) {
            console.error("Failed to save settings:", err);
        }
    }
}
));
