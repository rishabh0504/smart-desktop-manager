import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { FileEntry } from "@/types/explorer";
import { useExplorerStore } from "@/stores/explorerStore";
import { useListStore } from "@/stores/listStore";
import { usePreviewStore } from "@/stores/previewStore";
import { useDedupeStore } from "@/stores/dedupeStore";
import { toast } from "sonner";
import { CopyCheck, FolderPlus, Pencil } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface FileContextMenuProps {
    children: React.ReactNode;
    entry: FileEntry;
    tabId: string;
}

export const FileContextMenu = ({ children, entry, tabId }: FileContextMenuProps) => {
    const setPath = useExplorerStore((state) => state.setPath);
    const refresh = useExplorerStore((state) => state.refresh);
    const copyToClipboard = useExplorerStore((state) => state.copyToClipboard);
    const cutToClipboard = useExplorerStore((state) => state.cutToClipboard);
    const addItem = useListStore((state) => state.addItem);
    const openPreview = usePreviewStore((state) => state.openPreview);
    const addToDedupe = useDedupeStore((state) => state.addToQueue);
    const setActiveView = useExplorerStore((state) => state.setActiveView);

    const handleOpen = () => {
        if (entry.is_dir) {
            setPath(tabId, entry.path);
        } else {
            openPreview({ ...entry, path: entry.canonical_path });
        }
    };

    const handleAddToDedupe = () => {
        addToDedupe(entry.path);
        toast.success("Added to Duplicate Finder queue");
        setActiveView("dedupe");
    };

    const handleAddToList = () => {
        addItem(entry);
        // toast.success("Added to list");
    };

    const handleShowInFinder = () => {
        invoke("show_in_finder", { path: entry.path });
    };

    const handleDelete = async () => {
        const isSelected = useExplorerStore.getState().tabs.find(t => t.id === tabId)?.selection.has(entry.path);
        const selection = useExplorerStore.getState().tabs.find(t => t.id === tabId)?.selection;

        const pathsToDelete = isSelected && selection ? Array.from(selection) : [entry.path];

        const message = pathsToDelete.length === 1
            ? `Are you sure you want to delete "${entry.name}"?`
            : `Are you sure you want to delete ${pathsToDelete.length} items?`;

        const confirm = await window.confirm(message);
        if (!confirm) return;

        try {
            const operationId = crypto.randomUUID();
            await invoke("delete_items", { operationId, paths: pathsToDelete });
            refresh(tabId);
        } catch (error) {
            console.error("Delete failed:", error);
        }
    };

    const handleCopy = () => {
        copyToClipboard([entry.path]);
    };

    const handleCut = () => {
        cutToClipboard([entry.path]);
    };

    const handleProperties = () => {
        const date = entry.modified ? new Date(entry.modified * 1000).toLocaleString() : "Unknown";
        const size = entry.size !== null ? formatSize(entry.size) : "Unknown";
        alert(`Name: ${entry.name}\nType: ${entry.extension || "Folder"}\nSize: ${size}\nModified: ${date}\nPath: ${entry.path}`);
    };

    const handleRename = async () => {
        const newName = window.prompt("Enter new name:", entry.name);
        if (!newName || newName === entry.name) return;

        try {
            await invoke("rename_item", { path: entry.path, newName });
            toast.success("Renamed successfully");
            refresh(tabId);
        } catch (error) {
            toast.error(`Rename failed: ${error}`);
        }
    };

    const handleNewFolder = async () => {
        const folderName = window.prompt("Enter folder name:", "New Folder");
        if (!folderName) return;

        try {
            const currentPath = useExplorerStore.getState().tabs.find(t => t.id === tabId)?.path;
            if (!currentPath) return;

            const separator = currentPath.endsWith('/') ? '' : '/';
            const path = `${currentPath}${separator}${folderName}`;

            await invoke("create_folder", { path });
            toast.success("Folder created");
            refresh(tabId);
        } catch (error) {
            toast.error(`Create folder failed: ${error}`);
        }
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger>{children}</ContextMenuTrigger>
            <ContextMenuContent className="w-64">
                <ContextMenuItem onClick={handleOpen}>
                    Open
                </ContextMenuItem>
                {entry.is_dir && (
                    <ContextMenuItem onClick={handleAddToDedupe}>
                        <CopyCheck className="w-4 h-4 mr-2" />
                        Find Duplicates
                    </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleAddToList}>
                    Add to List Tray
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleCopy}>
                    Copy
                </ContextMenuItem>
                <ContextMenuItem onClick={handleCut}>
                    Cut
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleShowInFinder}>
                    Show in Finder
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleRename}>
                    <Pencil className="w-4 h-4 mr-2" /> Rename
                </ContextMenuItem>
                <ContextMenuItem onClick={handleNewFolder}>
                    <FolderPlus className="w-4 h-4 mr-2" /> New Folder
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleDelete} className="text-red-500 hover:text-red-600">
                    Delete
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleProperties}>
                    Properties
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
};

function formatSize(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}
