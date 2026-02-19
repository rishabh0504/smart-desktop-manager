export interface FileEntry {
    name: string;
    path: string;
    canonical_path: string;
    is_dir: boolean;
    size: number | null;
    modified: number | null;
    extension: string | null;
}

export interface DirectoryResponse {
    entries: FileEntry[];
    total: number;
    has_more: boolean;
}

export type SortField = "name" | "size" | "modified";
export type SortOrder = "asc" | "desc";

export interface PanelState {
    path: string;
    entries: FileEntry[];
    total: number;
    has_more: boolean;
    loading: boolean;
    sortBy: SortField;
    order: SortOrder;
    selection: Set<string>;
    isExpanded: boolean;
    viewMode: "list" | "grid";
    history: string[];
    currentIndex: number;
    lastSelectedPath: string | null;
}

export interface Tab extends PanelState {
    id: string;
    title: string;
    type: "explorer" | "duplicates" | "search" | "content_search" | "clean"; // extensible
}

export interface SearchResult {
    path: string;
    name: string;
    is_dir: boolean;
    line_number?: number;
    preview?: string;
}

export interface Volume {
    name: string;
    mount_point: string;
    total_space: number;
    available_space: number;
    is_removable: boolean;
    is_system: boolean;
}

export interface PreviewSettings {
    image: boolean;
    video: boolean;
    audio: boolean;
    text: boolean;
    pdf: boolean;
    archive: boolean;
    other: boolean;
}

export interface ConfigSection {
    preview_enabled: PreviewSettings;
    show_hidden_files: boolean;
    show_system_files: boolean;
    blocked_extensions: string[];
}

export interface ThemeSettings {
    use_custom_color: boolean;
    custom_color: string;
}

export interface AppSettings {
    explorer: ConfigSection;
    dedupe: ConfigSection;
    content_search: ConfigSection;
    clean: ConfigSection;
    theme: ThemeSettings;
    setup_completed: boolean;
}

export interface TreeNode {
    name: string;
    path: string;
    is_dir: boolean;
    has_children: boolean;
}

export interface EmptyFolder {
    path: string;
    name: string;
    parent_path: string;
}
