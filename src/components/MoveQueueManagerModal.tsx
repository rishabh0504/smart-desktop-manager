import { useState, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useMoveQueueStore } from "@/stores/moveQueueStore";
import type { FileEntry } from "@/types/explorer";
import { useExplorerStore } from "@/stores/explorerStore";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
    FolderInput,
    Trash2,
    FolderOpen,
    Loader2,
    Pencil,
    FileIcon,
    ChevronRight,
    ChevronDown,
    RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { FilePreviewContent } from "./FilePreviewContent";
import { usePreviewStore } from "@/stores/previewStore";
import { isVideoExtension } from "@/lib/fileTypes";

interface MoveQueueManagerModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type SelectedFile = { queueId: string; path: string };

export const MoveQueueManagerModal = ({ open: isOpen, onOpenChange }: MoveQueueManagerModalProps) => {
    const { queues, updateQueue, removeQueue, moveItemToQueue } = useMoveQueueStore();
    const refresh = useExplorerStore((s) => s.refresh);
    const tabs = useExplorerStore((s) => s.tabs);

    const [movingQueueId, setMovingQueueId] = useState<string | null>(null);
    const [expandedQueues, setExpandedQueues] = useState<Set<string>>(new Set());
    const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
    const [moveToQueueId, setMoveToQueueId] = useState<string>("");
    const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());

    const toggleQueueExpanded = (queueId: string) => {
        setExpandedQueues((prev) => {
            const next = new Set(prev);
            if (next.has(queueId)) next.delete(queueId);
            else next.add(queueId);
            return next;
        });
    };

    const selectedQueue = useMemo(
        () => (selectedFile ? queues.find((q) => q.id === selectedFile.queueId) : null),
        [queues, selectedFile]
    );
    const selectedEntry = useMemo((): FileEntry | null => {
        if (!selectedFile || !selectedQueue) return null;
        return selectedQueue.items.find((e) => e.path === selectedFile.path) ?? null;
    }, [selectedFile, selectedQueue]);

    const otherQueuesForMove = useMemo(
        () => (selectedFile ? queues.filter((q) => q.id !== selectedFile.queueId) : []),
        [queues, selectedFile]
    );

    const handleRenameQueue = (queueId: string, currentName: string) => {
        const name = window.prompt("Rename queue:", currentName);
        if (name?.trim()) {
            updateQueue(queueId, { name: name.trim() });
            toast.success("Queue renamed");
        }
    };

    const handleSetFolder = async (queueId: string) => {
        const folder = await open({ directory: true, title: "Destination folder" });
        if (folder === null || (Array.isArray(folder) && folder.length === 0)) return;
        const path = Array.isArray(folder) ? folder[0] : folder;
        updateQueue(queueId, { folderPath: path });
        toast.success("Destination updated");
    };

    const [moveProgress, setMoveProgress] = useState<{ processed: number; total: number } | null>(null);
    // Track counts for toast summary
    const moveSuccessCount = useRef(0);

    const handleMoveAll = async (queueId: string) => {
        const queue = useMoveQueueStore.getState().getQueue(queueId);
        if (!queue || queue.items.length === 0) return;
        if (!queue.folderPath) {
            toast.error(`Destination folder is unset for queue "${queue.name}". Click the folder icon to set one.`);
            return;
        }
        setMovingQueueId(queueId);
        const operationId = crypto.randomUUID();
        moveSuccessCount.current = 0;

        // Listen for per-item success: remove from queue in real-time
        const unlistenItemDone = await listen<{ operation_id: string; path: string }>("batch_item_completed", (event) => {
            if (event.payload.operation_id === operationId) {
                useMoveQueueStore.getState().removeFromQueue(queueId, event.payload.path);
                moveSuccessCount.current++;
            }
        });

        const unlistenProgress = await listen("batch_progress", (event: any) => {
            const data = event.payload;
            if (data.operation_id === operationId) {
                setMoveProgress({
                    processed: data.processed_items,
                    total: data.total_items
                });
            }
        });

        try {
            await invoke("batch_move", {
                operationId,
                sources: queue.items.map((e) => e.path),
                destinationDir: queue.folderPath,
            });
            // Refresh all explorer AND search_results tabs
            tabs.forEach((tab) => {
                if (tab.type === "explorer" || tab.type === "search_results") refresh(tab.id);
            });
            const count = moveSuccessCount.current;
            if (count > 0) toast.success(`Moved ${count} item(s) to ${queue.folderPath}`);
        } catch (e) {
            const count = moveSuccessCount.current;
            if (count > 0) {
                toast.warning(`Moved ${count} item(s); some failed.`);
            } else {
                toast.error(`Move failed: ${e}`);
            }
            // Refresh tabs for the ones that did succeed
            tabs.forEach((tab) => {
                if (tab.type === "explorer" || tab.type === "search_results") refresh(tab.id);
            });
        } finally {
            setMovingQueueId(null);
            setMoveProgress(null);
            unlistenItemDone();
            unlistenProgress();
        }
    };

    const handleMoveItemToQueue = () => {
        if (!selectedFile || !moveToQueueId) return;
        moveItemToQueue(selectedFile.queueId, moveToQueueId, selectedFile.path);
        toast.success("Item moved successfully");
        setMoveToQueueId("");
        setSelectedFile(null);
    };

    const handleBulkMoveToQueue = () => {
        if (bulkSelected.size === 0 || !moveToQueueId) return;
        let count = 0;
        bulkSelected.forEach((path) => {
            const queueId = queues.find(q => q.items.some(i => i.path === path))?.id;
            if (queueId) {
                moveItemToQueue(queueId, moveToQueueId, path);
                count++;
            }
        });
        toast.success(`Moved ${count} items successfully`);
        setBulkSelected(new Set());
        setMoveToQueueId("");
        setSelectedFile(null);
    };

    const handleRemoveItem = (queueId: string, path: string) => {
        useMoveQueueStore.getState().removeFromQueue(queueId, path);
        if (selectedFile?.path === path) setSelectedFile(null);
        toast.success("Removed from queue");
    };

    const handleBulkRemove = () => {
        if (bulkSelected.size === 0) return;
        let count = 0;
        bulkSelected.forEach((path) => {
            const queueId = queues.find(q => q.items.some(i => i.path === path))?.id;
            if (queueId) {
                useMoveQueueStore.getState().removeFromQueue(queueId, path);
                count++;
            }
        });
        toast.success(`Removed ${count} items from queues`);
        setBulkSelected(new Set());
        setSelectedFile(null);
    };

    const toggleBulk = (path: string) => {
        setBulkSelected(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl w-[90vw] min-h-[85vh] max-h-[90vh] overflow-hidden flex flex-col rounded-xl p-0 gap-0">
                <DialogHeader className="px-6 py-4 border-b shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <FolderInput className="w-5 h-5 text-primary" />
                        Move queue manager
                    </DialogTitle>
                </DialogHeader>

                {queues.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center p-8">
                        <p className="text-sm text-muted-foreground text-center">
                            No move queues. Right‑click a folder → Use as move destination to create one.
                        </p>
                    </div>
                ) : (
                    <div className="flex-1 grid grid-cols-[minmax(280px,1fr)_minmax(320px,1.4fr)] min-h-0">
                        {/* Left: tree of queues and files */}
                        <div className="border-r flex flex-col min-w-0">
                            <div className="px-3 py-2 border-b text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                Queues & files
                            </div>
                            <ScrollArea className="flex-1">
                                <ul className="p-2 space-y-0.5">
                                    {queues.map((q) => {
                                        const isExpanded = expandedQueues.has(q.id);
                                        return (
                                            <li key={q.id} className="rounded-md">
                                                <div
                                                    className={cn(
                                                        "flex items-center gap-1.5 py-2 px-2 rounded-md cursor-pointer hover:bg-muted/60",
                                                        isExpanded && "bg-muted/40"
                                                    )}
                                                >
                                                    <button
                                                        type="button"
                                                        className="p-0.5 shrink-0"
                                                        onClick={() => toggleQueueExpanded(q.id)}
                                                        aria-expanded={isExpanded}
                                                    >
                                                        {isExpanded ? (
                                                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                                        ) : (
                                                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                                        )}
                                                    </button>
                                                    <FolderInput className="w-4 h-4 shrink-0 text-muted-foreground" />
                                                    <span className="truncate flex-1 min-w-0 font-medium text-sm" title={q.name}>
                                                        {q.name}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground shrink-0">
                                                        {q.items.length}
                                                    </span>
                                                    <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7"
                                                            onClick={() => handleRenameQueue(q.id, q.name)}
                                                            title="Rename queue"
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7"
                                                            onClick={() => handleSetFolder(q.id)}
                                                            title="Change destination"
                                                        >
                                                            <FolderOpen className="w-3.5 h-3.5" />
                                                        </Button>
                                                        <Button
                                                            variant="default"
                                                            size="sm"
                                                            className="h-7 text-xs"
                                                            disabled={q.items.length === 0 || movingQueueId !== null || !q.folderPath}
                                                            onClick={!q.folderPath ? undefined : () => handleMoveAll(q.id)}
                                                            title={!q.folderPath ? "Set a destination folder first (click the folder icon)" : `Move all ${q.items.length} item(s) to ${q.folderPath}`}
                                                        >
                                                            {movingQueueId === q.id ? (
                                                                <div className="flex items-center gap-1.5 min-w-[60px] justify-center">
                                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                                    {moveProgress && (
                                                                        <span className="text-[9px] tabular-nums font-bold">
                                                                            {moveProgress.processed}/{moveProgress.total}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ) : !q.folderPath ? (
                                                                <span className="opacity-60">Set dest…</span>
                                                            ) : (
                                                                "Move all"
                                                            )}
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-destructive"
                                                            onClick={() => {
                                                                if (window.confirm(`Remove queue "${q.name}"?`)) removeQueue(q.id);
                                                            }}
                                                            title="Remove queue"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                </div>
                                                {isExpanded && (
                                                    <ul className="pl-6 pr-2 pb-2 space-y-0.5">
                                                        {q.items.length === 0 ? (
                                                            <li className="text-xs text-muted-foreground py-1.5 px-2">
                                                                No files
                                                            </li>
                                                        ) : (
                                                            q.items.map((item) => {
                                                                const isSelected =
                                                                    selectedFile?.queueId === q.id && selectedFile?.path === item.path;
                                                                return (
                                                                    <li key={item.path}>
                                                                        <button
                                                                            type="button"
                                                                            className={cn(
                                                                                "w-full flex items-center gap-2 py-1.5 px-2 rounded text-left text-sm",
                                                                                isSelected
                                                                                    ? "bg-primary/15 text-primary"
                                                                                    : "hover:bg-muted/50"
                                                                            )}
                                                                            onClick={() => setSelectedFile({ queueId: q.id, path: item.path })}
                                                                        >
                                                                            <Checkbox
                                                                                checked={bulkSelected.has(item.path)}
                                                                                onCheckedChange={() => toggleBulk(item.path)}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                className="h-3.5 w-3.5 shrink-0"
                                                                            />
                                                                            <FileIcon className="w-4 h-4 shrink-0 text-muted-foreground" />
                                                                            <span className="truncate min-w-0" title={item.path}>
                                                                                {item.name}
                                                                            </span>
                                                                        </button>
                                                                    </li>
                                                                );
                                                            })
                                                        )}
                                                    </ul>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </ScrollArea>
                        </div>

                        <div className="flex flex-col min-w-0 bg-muted/10">
                            <div className="px-4 py-2 border-b text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                                <span>Preview & Routing</span>
                                {bulkSelected.size > 0 && <span className="font-bold text-primary">{bulkSelected.size} items selected</span>}
                            </div>
                            <ScrollArea className="flex-1">
                                <div className="p-4 flex flex-col h-full gap-4">
                                    {bulkSelected.size > 1 ? (
                                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-background border rounded-lg shadow-sm">
                                            <FolderInput className="w-16 h-16 text-primary mb-4" />
                                            <h3 className="text-xl font-bold mb-2">Batch Actions</h3>
                                            <p className="text-sm text-muted-foreground mb-8">
                                                {bulkSelected.size} files selected across your move queues.
                                            </p>

                                            <div className="w-full max-w-sm space-y-4">
                                                <div className="flex gap-2">
                                                    <Select value={moveToQueueId || undefined} onValueChange={setMoveToQueueId}>
                                                        <SelectTrigger className="flex-1">
                                                            <SelectValue placeholder="Select target queue…" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {queues.map((oq) => (
                                                                <SelectItem key={oq.id} value={oq.id}>
                                                                    {oq.name} → {oq.folderPath || "(unset)"}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <Button disabled={!moveToQueueId} onClick={handleBulkMoveToQueue}>
                                                        Move {bulkSelected.size} Items
                                                    </Button>
                                                </div>
                                                <div className="relative">
                                                    <div className="absolute inset-0 flex items-center">
                                                        <span className="w-full border-t" />
                                                    </div>
                                                    <div className="relative flex justify-center text-xs uppercase">
                                                        <span className="bg-background px-2 text-muted-foreground">Or</span>
                                                    </div>
                                                </div>
                                                <Button variant="destructive" className="w-full" onClick={handleBulkRemove}>
                                                    <Trash2 className="w-4 h-4 mr-2" />
                                                    Dequeue {bulkSelected.size} Items
                                                </Button>
                                            </div>
                                        </div>
                                    ) : !selectedEntry ? (
                                        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background border rounded-lg text-muted-foreground text-center">
                                            <p className="text-sm">Select a file from the tree on the left to see preview and move it to another queue.</p>
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex flex-col gap-4 min-h-0">
                                            <section className="shrink-0 max-h-[400px] flex flex-col">
                                                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
                                                    Content preview
                                                </p>
                                                <div className="flex-1 rounded-lg border bg-background overflow-hidden relative shadow-sm flex items-center justify-center min-h-[200px]">
                                                    <FilePreviewContent
                                                        path={selectedEntry.path}
                                                        extension={selectedEntry.extension || ""}
                                                        name={selectedEntry.name}
                                                        section="explorer"
                                                    />
                                                </div>
                                            </section>

                                            <section className="bg-background border rounded-lg p-4 shadow-sm space-y-4 shrink-0">
                                                <div className="grid grid-cols-[1fr_auto] gap-4">
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Metadata</span>
                                                        <span className="text-xs font-mono font-bold truncate">{selectedEntry.name}</span>
                                                        <span className="text-[10px] font-mono text-muted-foreground truncate opacity-80" title={selectedEntry.path}>{selectedEntry.path}</span>
                                                        {selectedQueue && (
                                                            <div className="mt-2 flex gap-4 text-[10px]">
                                                                <div>
                                                                    <span className="uppercase text-muted-foreground/70 font-semibold mr-1">Origin Queue:</span>
                                                                    <span className="font-bold">{selectedQueue.name}</span>
                                                                </div>
                                                                <div className="truncate flex-1">
                                                                    <span className="uppercase text-muted-foreground/70 font-semibold mr-1">Target:</span>
                                                                    <span className="truncate" title={selectedQueue.folderPath}>{selectedQueue.folderPath || "(unset)"}</span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex flex-col gap-2 shrink-0 border-l pl-4 justify-center">
                                                        {(selectedEntry.extension && (["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(selectedEntry.extension.toLowerCase()) || isVideoExtension(selectedEntry.extension.toLowerCase()))) && (
                                                            <Button variant="outline" size="sm" className="h-7 text-[10px] w-full" onClick={() => usePreviewStore.getState().setRotation(usePreviewStore.getState().rotation + 90)}>
                                                                <RotateCw className="w-3 h-3 mr-1.5" /> Rotate
                                                            </Button>
                                                        )}
                                                        <Button variant="outline" size="sm" className="h-7 text-[10px] w-full" onClick={() => invoke("show_in_finder", { path: selectedEntry.path })}>
                                                            <FolderOpen className="w-3 h-3 mr-1.5" /> Reveal
                                                        </Button>
                                                        <Button variant="outline" size="sm" className="h-7 text-[10px] w-full" onClick={() => invoke("open_item", { path: selectedEntry.path })}>
                                                            <FolderInput className="w-3 h-3 mr-1.5" /> Open OS
                                                        </Button>
                                                        <Button variant="outline" size="sm" className="h-7 text-[10px] w-full text-destructive hover:bg-destructive/10" onClick={() => handleRemoveItem(selectedQueue!.id, selectedEntry.path)}>
                                                            <Trash2 className="w-3 h-3 mr-1.5" /> Dequeue
                                                        </Button>
                                                    </div>
                                                </div>

                                                {otherQueuesForMove.length > 0 && (
                                                    <div className="flex items-center gap-2 pt-3 border-t">
                                                        <span className="text-[10px] font-bold uppercase text-muted-foreground shrink-0 w-24">Route to</span>
                                                        <Select value={moveToQueueId || undefined} onValueChange={setMoveToQueueId}>
                                                            <SelectTrigger className="flex-1 h-8 text-xs">
                                                                <SelectValue placeholder="Select queue…" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {otherQueuesForMove.map((oq) => (
                                                                    <SelectItem key={oq.id} value={oq.id}>
                                                                        {oq.name} ({oq.folderPath || "Unset"})
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <Button size="sm" className="h-8" disabled={!moveToQueueId} onClick={handleMoveItemToQueue}>
                                                            Move File
                                                        </Button>
                                                    </div>
                                                )}
                                            </section>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
