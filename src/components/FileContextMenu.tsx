import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger } from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { FileEntry } from "@/types/explorer";
import { useExplorerStore } from "@/stores/explorerStore";
import { usePreviewStore } from "@/stores/previewStore";
import { useDedupeStore } from "@/stores/dedupeStore";
import { useDeleteQueueStore } from "@/stores/deleteQueueStore";
import { useMoveQueueStore } from "@/stores/moveQueueStore";
import { toast } from "sonner";
import { CopyCheck, FolderPlus, Pencil, Trash2, FolderInput, Archive, FileArchive } from "lucide-react";
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
    const currentTab = useExplorerStore((state) => state.tabs.find(t => t.id === tabId));

    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const [renameInput, setRenameInput] = useState("");
    const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
    const [newFolderInput, setNewFolderInput] = useState("");
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const existingNames = currentTab?.entries.map(e => e.name.toLowerCase()) || [];

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
            const name = entry.name;
            addMoveQueue(name, entry.path);
            toast.success(`Created queue "${name}" with this folder as destination`);
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

    const handleExtract = async () => {
        try {
            toast.info("Extracting archive...");
            await invoke("extract_archive", { path: entry.path });
            toast.success("Extraction complete");
            setIsDeleteDialogOpen(true);
        } catch (error) {
            toast.error(`Extraction failed: ${error}`);
        }
    };

    const confirmDeleteZip = async () => {
        setIsDeleteDialogOpen(false);
        try {
            const operationId = crypto.randomUUID();
            await invoke("delete_items", { operationId, paths: [entry.path] });
            toast.success("Original archive deleted");
            refresh(tabId);
        } catch (error) {
            console.error("Delete failed:", error);
            toast.error(`Delete failed: ${error}`);
        }
    };

    const handleCancelDeleteZip = () => {
        setIsDeleteDialogOpen(false);
        refresh(tabId);
    };

    const handleCompress = async () => {
        try {
            toast.info("Compressing to zip...");
            // Use entry.path to derive parent directory instead of tab.path
            // This guarantees it works in both File Explorer and Content Search (which may have no valid tab.path)
            const parentBase = entry.path.split(/[/\\]/).slice(0, -1).join("/") || "";
            const zipName = entry.is_dir ? `${entry.name}.zip` : `${entry.name.replace(/\.[^/.]+$/, "")}.zip`;
            const destPath = `${parentBase}/${zipName}`;

            await invoke("compress_to_zip", { paths: [entry.path], destPath });
            toast.success("Compression complete");
            refresh(tabId);
        } catch (error) {
            toast.error(`Compression failed: ${error}`);
        }
    };

    const handleRename = () => {
        setRenameInput(entry.name);
        setIsRenameOpen(true);
    };

    const confirmRename = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const newName = renameInput.trim();
        if (!newName || newName === entry.name) {
            setIsRenameOpen(false);
            return;
        }

        if (existingNames.includes(newName.toLowerCase())) {
            toast.error("An item with this name already exists in this folder");
            return;
        }

        try {
            await invoke("rename_item", { path: entry.path, newName });
            toast.success("Renamed successfully");
            setIsRenameOpen(false);
            refresh(tabId);
        } catch (error) {
            toast.error(`Rename failed: ${error}`);
        }
    };

    const handleNewFolder = () => {
        setNewFolderInput("New Folder");
        setIsNewFolderOpen(true);
    };

    const confirmNewFolder = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const folderName = newFolderInput.trim();
        if (!folderName) {
            setIsNewFolderOpen(false);
            return;
        }

        if (existingNames.includes(folderName.toLowerCase())) {
            toast.error("A folder with this name already exists in this directory");
            return;
        }

        try {
            const currentPath = currentTab?.path;
            if (!currentPath) return;

            const separator = currentPath.endsWith('/') || currentPath.endsWith('\\') ? '' : '/';
            const path = `${currentPath}${separator}${folderName}`;

            await invoke("create_folder", { path });
            toast.success("Folder created");
            setIsNewFolderOpen(false);
            setNewFolderInput("");
            refresh(tabId);
        } catch (error) {
            toast.error(`Create folder failed: ${error}`);
        }
    };

    return (
        <>
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
                                <FolderInput className="w-3.5 h-3.5 mr-2" /> Add to move destination
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className="text-xs [&_button]:text-xs">
                                <ContextMenuItem onClick={() => handleUseFolderAsDestination()} className="text-xs">Create New Queue...</ContextMenuItem>
                                {queues.map((q) => (
                                    <ContextMenuItem key={q.id} onClick={() => handleUseFolderAsDestination(q.id)} className="text-xs">Queue: {q.name}</ContextMenuItem>
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

                    {entry.extension && ["zip", "tar", "gz", "tgz", "rar", "7z"].includes(entry.extension.toLowerCase()) && (
                        <ContextMenuItem onClick={handleExtract} className="text-xs">
                            <Archive className="w-3.5 h-3.5 mr-2" /> Extract Archive
                        </ContextMenuItem>
                    )}
                    <ContextMenuItem onClick={handleCompress} className="text-xs">
                        <FileArchive className="w-3.5 h-3.5 mr-2" /> Compress to Zip
                    </ContextMenuItem>

                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={handleProperties} className="text-xs">Properties</ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Rename Item</DialogTitle>
                        <DialogDescription>
                            Enter a new name for the selected item.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={confirmRename}>
                        <div className="flex items-center space-x-2 py-4">
                            <Input
                                autoFocus
                                value={renameInput}
                                onChange={(e) => setRenameInput(e.target.value)}
                                placeholder="New name"
                                className="text-sm"
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsRenameOpen(false)}>Cancel</Button>
                            <Button type="submit">Rename</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>New Folder</DialogTitle>
                        <DialogDescription>
                            Create a new folder in this directory.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={confirmNewFolder}>
                        <div className="flex items-center space-x-2 py-4">
                            <Input
                                autoFocus
                                value={newFolderInput}
                                onChange={(e) => setNewFolderInput(e.target.value)}
                                placeholder="Folder name"
                                className="text-sm"
                                onFocus={(e) => e.target.select()}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsNewFolderOpen(false)}>Cancel</Button>
                            <Button type="submit">Create</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={(open) => {
                if (!open) handleCancelDeleteZip();
            }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Archive</AlertDialogTitle>
                        <AlertDialogDescription>
                            Extraction complete. Do you want to delete the original archive "{entry.name}"?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={handleCancelDeleteZip}>No, Keep It</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDeleteZip} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Yes, Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
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
