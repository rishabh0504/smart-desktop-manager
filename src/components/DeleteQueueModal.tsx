import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDeleteQueueStore } from "@/stores/deleteQueueStore";
import { useExplorerStore } from "@/stores/explorerStore";
import { FileEntry } from "@/types/explorer";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Trash2, FileText, FileQuestion, Folder, Loader2, X, ChevronUp, ChevronDown, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { useMoveQueueStore } from "@/stores/moveQueueStore";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { FilePreviewContent } from "./FilePreviewContent";

interface DeleteQueueModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const DeleteQueueModal = ({ open, onOpenChange }: DeleteQueueModalProps) => {
    const { queue, removeFromQueue } = useDeleteQueueStore();
    const refresh = useExplorerStore((s) => s.refresh);
    const tabs = useExplorerStore((s) => s.tabs);

    const [selected, setSelected] = useState<FileEntry | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
    const [targetQueueId, setTargetQueueId] = useState<string>("");

    const moveQueues = useMoveQueueStore((s) => s.queues);
    const addManyToMoveQueue = useMoveQueueStore((s) => s.addManyToQueue);

    const listRef = useRef<HTMLUListElement>(null);
    const deleteSuccessCount = useRef(0);

    useEffect(() => {
        if (!open) {
            setSelected(null);
            setConfirmOpen(false);
            setBulkSelected(new Set());
        } else if (queue.length > 0) {
            setSelected((prev) => (prev && queue.some((e) => e.path === prev.path) ? prev : queue[0]));
        } else {
            setSelected(null);
        }
    }, [open, queue.length]);

    useEffect(() => {
        if (moveQueues.length > 0 && !targetQueueId) {
            setTargetQueueId(moveQueues[0].id);
        }
    }, [moveQueues, targetQueueId]);

    useEffect(() => {
        if (selected && !queue.some((e) => e.path === selected.path)) {
            const idx = queue.findIndex((e) => e.path === selected.path);
            setSelected(queue[idx >= 0 ? idx : 0] ?? null);
        }
    }, [queue, selected]);

    const selectedIndex = selected ? queue.findIndex((e) => e.path === selected.path) : -1;
    const selectPrev = useCallback(() => {
        if (queue.length === 0) return;
        const idx = selectedIndex <= 0 ? queue.length - 1 : selectedIndex - 1;
        setSelected(queue[idx]);
        listRef.current?.querySelectorAll("li")[idx]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [queue, selectedIndex]);
    const selectNext = useCallback(() => {
        if (queue.length === 0) return;
        const idx = selectedIndex < 0 || selectedIndex >= queue.length - 1 ? 0 : selectedIndex + 1;
        setSelected(queue[idx]);
        listRef.current?.querySelectorAll("li")[idx]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [queue, selectedIndex]);

    const handleDeleteAll = useCallback(async () => {
        if (queue.length === 0) return;
        setConfirmOpen(true);
    }, [queue.length]);

    useEffect(() => {
        if (!open || queue.length === 0) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "ArrowUp") {
                e.preventDefault();
                selectPrev();
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                selectNext();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, queue.length, selectPrev, selectNext]);

    const [progress, setProgress] = useState<{ processed: number; total: number; current: string } | null>(null);

    const confirmDelete = useCallback(async () => {
        if (queue.length === 0) return;
        setDeleting(true);
        const operationId = crypto.randomUUID();
        deleteSuccessCount.current = 0;

        // Listen for real-time per-item success — remove from queue immediately as each item is deleted
        const unlistenItemDone = await listen<{ operation_id: string; path: string }>("batch_item_completed", (event) => {
            if (event.payload.operation_id === operationId) {
                removeFromQueue(event.payload.path);
                deleteSuccessCount.current++;
            }
        });

        const unlistenProgress = await listen("batch_progress", (event: any) => {
            const data = event.payload;
            if (data.operation_id === operationId) {
                setProgress({
                    processed: data.processed_items,
                    total: data.total_items,
                    current: data.current_item
                });
            }
        });

        try {
            await invoke("delete_items", { operationId, paths: queue.map((e) => e.path) });
            // Any remaining queue items are failures — leave them in queue
            onOpenChange(false);
            setConfirmOpen(false);

            // Refresh both explorer and search_results tabs
            tabs.forEach((tab) => {
                if (tab.type === "explorer" || tab.type === "search_results") refresh(tab.id);
            });

            const count = deleteSuccessCount.current;
            toast.success(`${count} item(s) deleted`);
        } catch (e) {
            const count = deleteSuccessCount.current;
            if (count > 0) {
                toast.warning(`Deleted ${count} item(s); some failed and remain in queue.`);
            } else {
                toast.error(`Delete failed: ${e}`);
            }
            // Refresh tabs for the ones that did succeed
            tabs.forEach((tab) => {
                if (tab.type === "explorer" || tab.type === "search_results") refresh(tab.id);
            });
            setConfirmOpen(false);
        } finally {
            setDeleting(false);
            setProgress(null);
            unlistenItemDone();
            unlistenProgress();
        }
    }, [queue, removeFromQueue, onOpenChange, tabs, refresh]);

    /** Delete a single item directly from the preview pane */
    const handleDeleteSingle = useCallback(async (entry: FileEntry) => {
        const operationId = crypto.randomUUID();
        try {
            await invoke("delete_items", { operationId, paths: [entry.path] });
            removeFromQueue(entry.path);
            tabs.forEach((tab) => {
                if (tab.type === "explorer" || tab.type === "search_results") refresh(tab.id);
            });
            toast.success(`Deleted ${entry.name}`);
        } catch (e) {
            toast.error(`Failed to delete ${entry.name}: ${e}`);
        }
    }, [removeFromQueue, tabs, refresh]);

    const toggleBulk = (path: string) => {
        setBulkSelected(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    const toggleAll = () => {
        if (bulkSelected.size === queue.length) {
            setBulkSelected(new Set());
        } else {
            setBulkSelected(new Set(queue.map(e => e.path)));
        }
    };

    const handleBulkMove = () => {
        if (bulkSelected.size === 0 || !targetQueueId) return;
        const itemsToMove = queue.filter(e => bulkSelected.has(e.path));
        addManyToMoveQueue(targetQueueId, itemsToMove);
        itemsToMove.forEach(e => removeFromQueue(e.path));
        setBulkSelected(new Set());
        toast.success(`Moved ${itemsToMove.length} items to queue`);
    };

    // Derive extension for the selected entry to pass to FilePreviewContent
    const selectedExt = selected ? (selected.extension ?? selected.name.split(".").pop() ?? "") : "";

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-4xl h-[88vh] flex flex-col p-0 overflow-hidden rounded-xl shadow-2xl border-2">
                    <DialogHeader className="px-6 py-4 border-b shrink-0 bg-gradient-to-r from-destructive/5 to-transparent">
                        <DialogTitle className="flex items-center gap-3 text-lg">
                            <div className="p-2 rounded-lg bg-destructive/10">
                                <Trash2 className="w-5 h-5 text-destructive" />
                            </div>
                            <span>Delete queue</span>
                            <span className="text-sm font-normal text-muted-foreground">
                                {queue.length} item{queue.length !== 1 ? "s" : ""}
                            </span>
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 flex min-h-0">
                        {/* Left: file list */}
                        <div className="w-80 shrink-0 flex flex-col border-r bg-muted/5">
                            <div className="px-3 py-2 border-b flex items-center justify-between bg-muted/10">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        checked={bulkSelected.size === queue.length && queue.length > 0}
                                        onCheckedChange={toggleAll}
                                        className="h-3.5 w-3.5"
                                    />
                                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                                        Queued items
                                    </span>
                                </div>
                                {queue.length > 0 && (
                                    <div className="flex items-center gap-0.5">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={selectPrev}
                                            title="Previous"
                                        >
                                            <ChevronUp className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={selectNext}
                                            title="Next"
                                        >
                                            <ChevronDown className="w-4 h-4" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                            <ScrollArea className="flex-1">
                                {queue.length === 0 ? (
                                    <div className="p-8 text-center text-sm text-muted-foreground">
                                        <Folder className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                        <p>Queue is empty</p>
                                        <p className="text-xs mt-1">Add items from preview or context menu</p>
                                    </div>
                                ) : (
                                    <ul ref={listRef} className="p-2 space-y-1">
                                        {queue.map((entry, index) => (
                                            <li
                                                key={entry.path}
                                                className={cn(
                                                    "flex items-center gap-2 rounded-lg p-2 text-sm cursor-pointer group transition-colors",
                                                    selected?.path === entry.path
                                                        ? "bg-primary/15 ring-1 ring-primary/40 shadow-sm"
                                                        : "hover:bg-muted/50"
                                                )}
                                                onClick={() => setSelected(entry)}
                                            >
                                                <Checkbox
                                                    checked={bulkSelected.has(entry.path)}
                                                    onCheckedChange={() => toggleBulk(entry.path)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="h-3.5 w-3.5"
                                                />
                                                {entry.is_dir ? (
                                                    <Folder className="w-4 h-4 shrink-0 text-blue-500" />
                                                ) : (
                                                    <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                                                )}
                                                <span className="truncate flex-1 min-w-0" title={entry.name}>
                                                    {entry.name}
                                                </span>
                                                {queue.length > 1 && (
                                                    <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                                                        {index + 1}/{queue.length}
                                                    </span>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        removeFromQueue(entry.path);
                                                    }}
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </ScrollArea>
                        </div>

                        {/* Right: Preview using shared FilePreviewContent */}
                        <div className="flex-1 flex flex-col min-w-0 border-l bg-gradient-to-b from-background to-muted/10">
                            {!selected ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm bg-gradient-to-b from-muted/5 to-muted/15">
                                    <FileQuestion className="w-14 h-14 mb-3 opacity-30" />
                                    <p className="font-medium">Select an item to preview</p>
                                    <p className="text-xs mt-1 opacity-80">Use the list or ↑ ↓ to choose</p>
                                </div>
                            ) : (
                                <>
                                    <div className="px-4 py-3 border-b bg-muted/20 text-sm font-semibold truncate shadow-sm" title={selected.path}>
                                        {selected.name}
                                    </div>
                                    <div className="flex-1 flex items-center justify-center overflow-hidden">
                                        <FilePreviewContent
                                            path={selected.path}
                                            extension={selectedExt}
                                            name={selected.name}
                                            is_dir={selected.is_dir}
                                            section="explorer"
                                        />
                                    </div>
                                    {/* Single-item delete button in preview footer */}
                                    <div className="px-4 py-3 border-t bg-muted/10 flex items-center justify-between gap-3 shrink-0">
                                        <span className="text-[10px] text-muted-foreground font-mono truncate opacity-60" title={selected.path}>
                                            {selected.path}
                                        </span>
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            className="h-7 text-xs shrink-0 gap-1.5"
                                            onClick={() => handleDeleteSingle(selected)}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            Delete this
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="px-6 py-4 border-t flex justify-between items-center shrink-0 bg-muted/5">
                        <div className="flex items-center gap-4">
                            {bulkSelected.size > 0 && (
                                <div className="flex items-center gap-2 p-1 pl-3 bg-muted/20 border rounded-lg animate-in fade-in slide-in-from-bottom-2">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                        {bulkSelected.size} selected
                                    </span>
                                    <div className="flex items-center gap-1 ml-2">
                                        <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground mr-1" />
                                        <Select value={targetQueueId} onValueChange={setTargetQueueId}>
                                            <SelectTrigger className="h-7 text-xs w-[140px] bg-background">
                                                <SelectValue placeholder="Target Queue" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {moveQueues.map(q => (
                                                    <SelectItem key={q.id} value={q.id}>
                                                        {q.name}
                                                    </SelectItem>
                                                ))}
                                                {moveQueues.length === 0 && (
                                                    <SelectItem value="none" disabled>No queues found</SelectItem>
                                                )}
                                            </SelectContent>
                                        </Select>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            className="h-7 text-[10px] font-bold"
                                            onClick={handleBulkMove}
                                            disabled={!targetQueueId || targetQueueId === "none"}
                                        >
                                            MOVE TO QUEUE
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <Button
                            variant="destructive"
                            size="sm"
                            className="font-semibold shadow-md"
                            disabled={queue.length === 0}
                            onClick={handleDeleteAll}
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete all ({queue.length})
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="sm:max-w-md rounded-xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Trash2 className="w-4 h-4 text-destructive" />
                            Confirm delete
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        Permanently delete {queue.length} item(s)? This cannot be undone.
                    </p>
                    <div className="flex justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
                            {deleting ? (
                                <div className="flex flex-col items-center">
                                    <div className="flex items-center">
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        <span>Deleting...</span>
                                    </div>
                                    {progress && (
                                        <span className="text-[10px] opacity-70 mt-1">
                                            {progress.processed}/{progress.total} · {progress.current}
                                        </span>
                                    )}
                                </div>
                            ) : (
                                "Delete"
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
