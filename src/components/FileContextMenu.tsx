import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger } from "@/components/ui/context-menu";
import { FileEntry } from "@/types/explorer";
import { useExplorerStore } from "@/stores/explorerStore";
import { usePreviewStore } from "@/stores/previewStore";
import { useDedupeStore } from "@/stores/dedupeStore";
import { useDeleteQueueStore } from "@/stores/deleteQueueStore";
import { useMoveQueueStore } from "@/stores/moveQueueStore";
import { toast } from "sonner";
import { CopyCheck, FolderPlus, Pencil, Trash2, FolderInput } from "lucide-react";
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
    const openPreview = usePreviewStore((state) => state.openPreview);
    const addToDedupe = useDedupeStore((state) => state.addToQueue);
    const addToDeleteQueue = useDeleteQueueStore((state) => state.addToQueue);
    const { queues, addQueue: addMoveQueue, addToQueue: addToMoveQueue, updateQueue } = useMoveQueueStore();
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

    const handleAddToDeleteQueue = () => {
        addToDeleteQueue(entry);
        toast.success("Added to delete queue");
    };

    const handleAddEntryToMoveQueue = (queueId: string) => {
        addToMoveQueue(queueId, entry);
        toast.success("Added to move queue");
    };

    const handleUseFolderAsDestination = (queueId?: string) => {
        if (queueId) {
            updateQueue(queueId, { folderPath: entry.path });
            toast.success("Destination updated");
        } else {
            const name = `queue-${queues.length + 1}`;
            addMoveQueue(name, entry.path);
            toast.success(`Created ${name} with this folder as destination`);
        }
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
            <ContextMenuContent className="w-48 text-xs [&_button]:text-xs">
                <ContextMenuItem onClick={handleOpen} className="text-xs">Open</ContextMenuItem>
                {entry.is_dir && (
                    <ContextMenuItem onClick={handleAddToDedupe} className="text-xs">
                        <CopyCheck className="w-3.5 h-3.5 mr-2" /> Find duplicates
                    </ContextMenuItem>
                )}
                {entry.is_dir && (
                    <ContextMenuSub>
                        <ContextMenuSubTrigger className="text-xs">
                            <FolderInput className="w-3.5 h-3.5 mr-2" /> Use as move destination
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="text-xs [&_button]:text-xs">
                            <ContextMenuItem onClick={() => handleUseFolderAsDestination()} className="text-xs">New queue</ContextMenuItem>
                            {queues.map((q) => (
                                <ContextMenuItem key={q.id} onClick={() => handleUseFolderAsDestination(q.id)} className="text-xs">Set for {q.name}</ContextMenuItem>
                            ))}
                        </ContextMenuSubContent>
                    </ContextMenuSub>
                )}
                <ContextMenuSub>
                    <ContextMenuSubTrigger className="text-xs">
                        <FolderInput className="w-3.5 h-3.5 mr-2" /> Add to move queue
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="text-xs [&_button]:text-xs">
                        {queues.length === 0 ? (
                            <ContextMenuItem disabled className="text-xs">No queues</ContextMenuItem>
                        ) : (
                            queues.map((q) => (
                                <ContextMenuItem key={q.id} onClick={() => handleAddEntryToMoveQueue(q.id)} className="text-xs">{q.name} ({q.items.length})</ContextMenuItem>
                            ))
                        )}
                    </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleCopy} className="text-xs">Copy</ContextMenuItem>
                <ContextMenuItem onClick={handleCut} className="text-xs">Cut</ContextMenuItem>
                <ContextMenuItem onClick={handleShowInFinder} className="text-xs">Show in Finder</ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleRename} className="text-xs"><Pencil className="w-3.5 h-3.5 mr-2" /> Rename</ContextMenuItem>
                <ContextMenuItem onClick={handleNewFolder} className="text-xs"><FolderPlus className="w-3.5 h-3.5 mr-2" /> New folder</ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleAddToDeleteQueue} className="text-xs text-destructive hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Add to delete queue
                </ContextMenuItem>
                <ContextMenuItem onClick={handleDelete} className="text-xs text-red-500 hover:text-red-600">Delete</ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleProperties} className="text-xs">Properties</ContextMenuItem>
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
