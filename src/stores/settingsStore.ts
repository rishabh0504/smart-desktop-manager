import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { ExplorerSettings, PreviewSettings } from "@/types/explorer";
import { useExplorerStore } from "./explorerStore";

interface SettingsState {
    settings: ExplorerSettings;
    loading: boolean;

    // Actions
    loadSettings: () => Promise<void>;
    updateSettings: (settings: Partial<ExplorerSettings>) => Promise<void>;
    updatePreviewSettings: (preview: Partial<PreviewSettings>) => Promise<void>;
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

    loadSettings: async () => {
        set({ loading: true });
        try {
            const settings = await invoke<ExplorerSettings>("load_settings");
            set({ settings, loading: false });
        } catch (err) {
            console.error("Failed to load settings:", err);
            set({ loading: false });
        }
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
