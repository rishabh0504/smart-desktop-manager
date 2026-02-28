import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDeleteQueueStore } from "@/stores/deleteQueueStore";
import { useExplorerStore } from "@/stores/explorerStore";
import { FileEntry } from "@/types/explorer";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
    Trash2,
    FileText,
    FileQuestion,
    Folder,
    Loader2,
    X,
    ChevronUp,
    ChevronDown,
    ArrowRightLeft,
    ListX,
    FolderOpen,
    Info,
} from "lucide-react";
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

// ─── Constants ────────────────────────────────────────────────────────────────

const SELECTED_PATH_KEY = "deleteQueue_selectedPath";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readPersistedSelectedPath(): string | null {
    try {
        const raw = localStorage.getItem(SELECTED_PATH_KEY);
        return raw ? (JSON.parse(raw) as string) : null;
    } catch {
        return null;
    }
}

function persistSelectedPath(path: string | null): void {
    try {
        if (path) localStorage.setItem(SELECTED_PATH_KEY, JSON.stringify(path));
        else localStorage.removeItem(SELECTED_PATH_KEY);
    } catch {
        // quota / private-browsing — safe to ignore
    }
}

function formatBytes(bytes: number | null | undefined): string {
    if (bytes == null || bytes < 0) return "";
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DeleteQueueModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const DeleteQueueModal = ({ open, onOpenChange }: DeleteQueueModalProps) => {
    const { queue, removeFromQueue, validateQueue } = useDeleteQueueStore();
    const refresh = useExplorerStore((s) => s.refresh);
    const tabs = useExplorerStore((s) => s.tabs);

    // ── Selection — persisted to localStorage ─────────────────────────────
    const [selected, setSelectedState] = useState<FileEntry | null>(null);

    const setSelected = useCallback((entry: FileEntry | null) => {
        setSelectedState(entry);
        persistSelectedPath(entry?.path ?? null);
    }, []);

    // ── UI state ──────────────────────────────────────────────────────────
    const [confirmAllOpen, setConfirmAllOpen] = useState(false);
    const [confirmSingleOpen, setConfirmSingleOpen] = useState(false);
    const [pendingSingleEntry, setPendingSingleEntry] = useState<FileEntry | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
    const [targetQueueId, setTargetQueueId] = useState<string>("");
    const [progress, setProgress] = useState<{ processed: number; total: number; current: string } | null>(null);

    const moveQueues = useMoveQueueStore((s) => s.queues);
    const addManyToMoveQueue = useMoveQueueStore((s) => s.addManyToQueue);

    const listRef = useRef<HTMLUListElement>(null);
    const deleteSuccessCount = useRef(0);

    // ── Computed ──────────────────────────────────────────────────────────
    const selectedIndex = useMemo(
        () => (selected ? queue.findIndex((e) => e.path === selected.path) : -1),
        [queue, selected]
    );

    const selectedExt = selected
        ? (selected.extension ?? selected.name.split(".").pop() ?? "").toLowerCase()
        : "";

    // ── On open: validate stale paths ─────────────────────────────────────
    useEffect(() => {
        if (!open) {
            setConfirmAllOpen(false);
            setConfirmSingleOpen(false);
            setBulkSelected(new Set());
            return;
        }
        validateQueue();
    }, [open, validateQueue]);

    // ── Sync / restore selection when queue changes ───────────────────────
    useEffect(() => {
        if (queue.length === 0) {
            setSelected(null);
            return;
        }
        setSelectedState((prev) => {
            if (prev && queue.some((e) => e.path === prev.path)) return prev;
            const savedPath = readPersistedSelectedPath();
            const restored = savedPath ? queue.find((e) => e.path === savedPath) : null;
            const next = restored ?? queue[0];
            persistSelectedPath(next?.path ?? null);
            return next ?? null;
        });
    }, [queue, setSelected]);

    // ── Move-queue default ────────────────────────────────────────────────
    useEffect(() => {
        if (moveQueues.length > 0 && (!targetQueueId || !moveQueues.some((q) => q.id === targetQueueId))) {
            setTargetQueueId(moveQueues[0].id);
        }
    }, [moveQueues, targetQueueId]);

    // ── Keyboard navigation ───────────────────────────────────────────────
    const selectPrev = useCallback(() => {
        if (queue.length === 0) return;
        const idx = selectedIndex <= 0 ? queue.length - 1 : selectedIndex - 1;
        setSelected(queue[idx]);
        listRef.current?.querySelectorAll("li")[idx]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [queue, selectedIndex, setSelected]);

    const selectNext = useCallback(() => {
        if (queue.length === 0) return;
        const idx = selectedIndex < 0 || selectedIndex >= queue.length - 1 ? 0 : selectedIndex + 1;
        setSelected(queue[idx]);
        listRef.current?.querySelectorAll("li")[idx]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [queue, selectedIndex, setSelected]);

    useEffect(() => {
        if (!open || queue.length === 0) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "ArrowUp") { e.preventDefault(); selectPrev(); }
            else if (e.key === "ArrowDown") { e.preventDefault(); selectNext(); }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, queue.length, selectPrev, selectNext]);

    // ── Shared tab refresh helper ─────────────────────────────────────────
    const refreshAllTabs = useCallback(() => {
        tabs.forEach((tab) => {
            if (tab.type === "explorer" || tab.type === "search_results") refresh(tab.id);
        });
    }, [tabs, refresh]);

    // ── Delete ALL ────────────────────────────────────────────────────────
    const confirmDeleteAll = useCallback(async () => {
        if (queue.length === 0) return;
        setDeleting(true);
        const operationId = crypto.randomUUID();
        deleteSuccessCount.current = 0;

        const unlistenItem = await listen<{ operation_id: string; path: string }>("batch_item_completed", (ev) => {
            if (ev.payload.operation_id === operationId) {
                removeFromQueue(ev.payload.path);
                deleteSuccessCount.current++;
            }
        });
        const unlistenProgress = await listen("batch_progress", (ev: any) => {
            const d = ev.payload;
            if (d.operation_id === operationId) {
                setProgress({ processed: d.processed_items, total: d.total_items, current: d.current_item });
            }
        });

        try {
            await invoke("delete_items", { operationId, paths: queue.map((e) => e.path) });
            onOpenChange(false);
            setConfirmAllOpen(false);
            refreshAllTabs();
            toast.success(`${deleteSuccessCount.current} item(s) deleted`);
        } catch (e) {
            const c = deleteSuccessCount.current;
            c > 0
                ? toast.warning(`Deleted ${c} item(s); some failed and remain in queue.`)
                : toast.error(`Delete failed: ${e}`);
            refreshAllTabs();
            setConfirmAllOpen(false);
        } finally {
            setDeleting(false);
            setProgress(null);
            unlistenItem();
            unlistenProgress();
        }
    }, [queue, removeFromQueue, onOpenChange, refreshAllTabs]);

    // ── Delete SINGLE (with confirm) ──────────────────────────────────────
    const requestSingleDelete = useCallback((entry: FileEntry) => {
        setPendingSingleEntry(entry);
        setConfirmSingleOpen(true);
    }, []);

    const confirmDeleteSingle = useCallback(async () => {
        if (!pendingSingleEntry) return;
        const entry = pendingSingleEntry;
        setConfirmSingleOpen(false);
        setPendingSingleEntry(null);

        // Auto-advance selection BEFORE deletion so the list doesn't flash empty
        const idx = queue.findIndex((e) => e.path === entry.path);
        const nextEntry = queue[idx + 1] ?? queue[idx - 1] ?? null;

        const operationId = crypto.randomUUID();
        try {
            await invoke("delete_items", { operationId, paths: [entry.path] });
            removeFromQueue(entry.path);
            setSelected(nextEntry);
            refreshAllTabs();
            toast.success(`Deleted "${entry.name}"`);
        } catch (e) {
            toast.error(`Failed to delete "${entry.name}": ${e}`);
        }
    }, [pendingSingleEntry, queue, removeFromQueue, setSelected, refreshAllTabs]);

    // ── Bulk helpers ──────────────────────────────────────────────────────
    const toggleBulk = useCallback((path: string) => {
        setBulkSelected((prev) => {
            const next = new Set(prev);
            next.has(path) ? next.delete(path) : next.add(path);
            return next;
        });
    }, []);

    const toggleAll = useCallback(() => {
        setBulkSelected((prev) =>
            prev.size === queue.length ? new Set() : new Set(queue.map((e) => e.path))
        );
    }, [queue]);

    // Bulk move selected items to a move queue
    const handleBulkMoveToMoveQueue = useCallback(() => {
        if (bulkSelected.size === 0 || !targetQueueId) return;
        const items = queue.filter((e) => bulkSelected.has(e.path));
        addManyToMoveQueue(targetQueueId, items);
        items.forEach((e) => removeFromQueue(e.path));
        setBulkSelected(new Set());
        toast.success(`Moved ${items.length} item(s) to move queue`);
    }, [bulkSelected, targetQueueId, queue, addManyToMoveQueue, removeFromQueue]);

    // Bug fix #3: Bulk DEQUEUE (remove from delete queue entirely)
    const handleBulkDequeue = useCallback(() => {
        if (bulkSelected.size === 0) return;
        const paths = Array.from(bulkSelected);
        // Auto-advance selection if selected item is being dequeued
        if (selected && bulkSelected.has(selected.path)) {
            const remaining = queue.filter((e) => !bulkSelected.has(e.path));
            setSelected(remaining[0] ?? null);
        }
        paths.forEach((p) => removeFromQueue(p));
        setBulkSelected(new Set());
        toast.success(`Removed ${paths.length} item(s) from queue`);
    }, [bulkSelected, selected, queue, removeFromQueue, setSelected]);

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <>
            {/* ── Main Modal ─────────────────────────────────────────────── */}
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-[900px] w-[95vw] h-[88vh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl border border-border/60">

                    {/* Header */}
                    <DialogHeader className="px-5 py-3.5 border-b shrink-0 bg-gradient-to-r from-destructive/8 via-background to-background">
                        <DialogTitle className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-destructive/12 ring-1 ring-destructive/20 shrink-0">
                                <Trash2 className="w-4 h-4 text-destructive" />
                            </div>
                            <span className="font-semibold text-base">Delete queue</span>
                            {/* Live count badge */}
                            <span className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums transition-colors",
                                queue.length > 0
                                    ? "bg-destructive/12 text-destructive"
                                    : "bg-muted text-muted-foreground"
                            )}>
                                {queue.length} item{queue.length !== 1 ? "s" : ""}
                            </span>
                            {bulkSelected.size > 0 && (
                                <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary/12 text-primary animate-in fade-in">
                                    {bulkSelected.size} selected
                                </span>
                            )}
                        </DialogTitle>
                    </DialogHeader>

                    {/* Body */}
                    <div className="flex-1 flex min-h-0">

                        {/* ── Left: file list ──────────────────────────────── */}
                        <div className="w-72 shrink-0 flex flex-col border-r bg-muted/5">
                            {/* List toolbar */}
                            <div className="px-3 py-2 border-b flex items-center justify-between bg-muted/10">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        checked={bulkSelected.size === queue.length && queue.length > 0}
                                        onCheckedChange={toggleAll}
                                        className="h-3.5 w-3.5"
                                    />
                                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                                        Queued files
                                    </span>
                                </div>
                                {queue.length > 1 && (
                                    <div className="flex items-center rounded-md border overflow-hidden">
                                        <Button variant="ghost" size="icon" className="h-6 w-7 rounded-none border-r" onClick={selectPrev} title="Previous (↑)">
                                            <ChevronUp className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-6 w-7 rounded-none" onClick={selectNext} title="Next (↓)">
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* List body */}
                            <ScrollArea className="flex-1">
                                {queue.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
                                        <div className="w-14 h-14 rounded-full bg-muted/30 flex items-center justify-center">
                                            <FolderOpen className="w-7 h-7 text-muted-foreground/40" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground">Queue is empty</p>
                                            <p className="text-xs text-muted-foreground/60 mt-0.5">Add items from preview or context menu</p>
                                        </div>
                                    </div>
                                ) : (
                                    <ul ref={listRef} className="p-2 space-y-0.5">
                                        {queue.map((entry, index) => {
                                            const isSelected = selected?.path === entry.path;
                                            const isBulked = bulkSelected.has(entry.path);
                                            const ext = (entry.extension ?? entry.name.split(".").pop() ?? "").toUpperCase();
                                            const sizeStr = formatBytes(entry.size);
                                            return (
                                                <li
                                                    key={entry.path}
                                                    className={cn(
                                                        "group flex items-center gap-2 rounded-lg px-2 py-2 text-sm cursor-pointer transition-all duration-150",
                                                        isSelected
                                                            ? "bg-destructive/10 ring-1 ring-destructive/30 shadow-sm"
                                                            : isBulked
                                                                ? "bg-primary/8 ring-1 ring-primary/20"
                                                                : "hover:bg-muted/50"
                                                    )}
                                                    onClick={() => setSelected(entry)}
                                                >
                                                    <Checkbox
                                                        checked={isBulked}
                                                        onCheckedChange={() => toggleBulk(entry.path)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="h-3.5 w-3.5 shrink-0"
                                                    />
                                                    {/* File type icon */}
                                                    {entry.is_dir
                                                        ? <Folder className="w-4 h-4 shrink-0 text-blue-400" />
                                                        : <FileText className={cn("w-4 h-4 shrink-0", isSelected ? "text-destructive/70" : "text-muted-foreground")} />
                                                    }
                                                    {/* Name + meta */}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="truncate text-[13px] font-medium leading-tight" title={entry.name}>
                                                            {entry.name}
                                                        </p>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            {ext && (
                                                                <span className={cn(
                                                                    "inline-block px-1 py-px rounded text-[9px] font-bold uppercase tracking-wide",
                                                                    isSelected ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"
                                                                )}>
                                                                    {ext}
                                                                </span>
                                                            )}
                                                            {sizeStr && (
                                                                <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                                                                    {sizeStr}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {/* Position */}
                                                    {queue.length > 1 && (
                                                        <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0">
                                                            {index + 1}/{queue.length}
                                                        </span>
                                                    )}
                                                    {/* Remove button */}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 transition-opacity"
                                                        onClick={(e) => { e.stopPropagation(); removeFromQueue(entry.path); }}
                                                        title="Remove from queue"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </Button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </ScrollArea>
                        </div>

                        {/* ── Right: Preview pane ──────────────────────────── */}
                        {/* Bug fix #1: was a fragment — now a proper flex column */}
                        <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-gradient-to-b from-background to-muted/10">
                            {!selected ? (
                                /* Empty state */
                                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground bg-gradient-to-b from-muted/5 to-muted/15 px-8">
                                    <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center">
                                        <FileQuestion className="w-8 h-8 opacity-40" />
                                    </div>
                                    <div className="text-center">
                                        <p className="font-medium text-sm">Select a file to preview</p>
                                        <p className="text-xs opacity-60 mt-0.5">Click an item or use ↑ ↓ to navigate</p>
                                    </div>
                                    {queue.length > 0 && (
                                        <div className="flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-muted/30 rounded-lg text-xs text-muted-foreground">
                                            <Info className="w-3.5 h-3.5 shrink-0" />
                                            <span>{queue.length} item{queue.length !== 1 ? "s" : ""} waiting</span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {/* Preview header */}
                                    <div className="px-4 py-2.5 border-b bg-muted/15 shrink-0 flex items-center gap-2">
                                        <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                                        <span className="text-sm font-semibold truncate flex-1 min-w-0" title={selected.path}>
                                            {selected.name}
                                        </span>
                                        {selectedExt && (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-muted text-muted-foreground shrink-0">
                                                {selectedExt}
                                            </span>
                                        )}
                                    </div>

                                    {/* Preview content */}
                                    <div className="flex-1 flex items-center justify-center overflow-hidden min-h-0">
                                        <FilePreviewContent
                                            path={selected.path}
                                            extension={selectedExt}
                                            name={selected.name}
                                            is_dir={selected.is_dir}
                                            section="explorer"
                                        />
                                    </div>

                                    {/* Preview footer */}
                                    <div className="px-4 py-3 border-t bg-muted/10 flex items-center gap-3 shrink-0">
                                        <div className="flex-1 min-w-0">
                                            <p
                                                className="text-[10px] font-mono text-muted-foreground truncate opacity-50"
                                                title={selected.path}
                                            >
                                                {selected.path}
                                            </p>
                                            {selected.size != null && (
                                                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                                                    {formatBytes(selected.size)}
                                                </p>
                                            )}
                                        </div>
                                        {/* Bug fix #2: single-item delete now prompts for confirmation */}
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            className="h-7 text-xs shrink-0 gap-1.5 font-semibold"
                                            onClick={() => requestSingleDelete(selected)}
                                            title="Permanently delete this file"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            Delete this
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* ── Footer action bar ─────────────────────────────────── */}
                    <div className="px-5 py-3 border-t shrink-0 bg-muted/5 flex items-center justify-between gap-3">
                        {/* Left: bulk actions — animated in */}
                        <div className="flex items-center gap-2 flex-wrap min-h-[32px]">
                            {bulkSelected.size > 0 && (
                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
                                    {/* Bug fix #3: Bulk Dequeue button */}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 gap-1.5 text-xs font-semibold border-destructive/40 text-destructive hover:bg-destructive/10"
                                        onClick={handleBulkDequeue}
                                        title="Remove selected items from queue (without deleting)"
                                    >
                                        <ListX className="w-3.5 h-3.5" />
                                        Dequeue {bulkSelected.size}
                                    </Button>

                                    {/* Divider */}
                                    {moveQueues.length > 0 && <div className="w-px h-5 bg-border" />}

                                    {/* Move to move-queue */}
                                    {moveQueues.length > 0 && (
                                        <>
                                            <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                            <Select value={targetQueueId} onValueChange={setTargetQueueId}>
                                                <SelectTrigger className="h-8 text-xs w-[150px] bg-background">
                                                    <SelectValue placeholder="Move queue" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {moveQueues.map((q) => (
                                                        <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                className="h-8 text-xs font-semibold"
                                                onClick={handleBulkMoveToMoveQueue}
                                                disabled={!targetQueueId}
                                            >
                                                → Move queue
                                            </Button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Right: Delete all */}
                        <Button
                            variant="destructive"
                            size="sm"
                            className="h-8 font-semibold shadow-sm gap-1.5 shrink-0"
                            disabled={queue.length === 0}
                            onClick={() => setConfirmAllOpen(true)}
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete all ({queue.length})
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Confirm Delete ALL ─────────────────────────────────────── */}
            {/* Bug fix #5: count derived live from queue.length, not a snapshot */}
            <AlertDialog open={confirmAllOpen} onOpenChange={setConfirmAllOpen}>
                <AlertDialogContent className="rounded-2xl max-w-sm">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <Trash2 className="w-4 h-4 text-destructive" />
                            Delete {queue.length} item{queue.length !== 1 ? "s" : ""}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete all {queue.length} item{queue.length !== 1 ? "s" : ""} in the queue. This action <strong>cannot be undone</strong>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    {/* Progress bar during deletion */}
                    {deleting && progress && (
                        <div className="px-4 py-3 bg-muted/20 rounded-lg space-y-2 my-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Deleting…
                                </span>
                                <span className="tabular-nums font-semibold">
                                    {progress.processed}/{progress.total}
                                </span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                                <div
                                    className="h-full bg-destructive rounded-full transition-all duration-300"
                                    style={{ width: `${Math.round((progress.processed / progress.total) * 100)}%` }}
                                />
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate opacity-70" title={progress.current}>
                                {progress.current}
                            </p>
                        </div>
                    )}

                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); confirmDeleteAll(); }}
                            disabled={deleting}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                            {deleting ? "Deleting…" : "Delete all"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* ── Confirm Delete SINGLE ──────────────────────────────────── */}
            {/* Bug fix #2: confirmation before single-item delete */}
            <AlertDialog open={confirmSingleOpen} onOpenChange={setConfirmSingleOpen}>
                <AlertDialogContent className="rounded-2xl max-w-sm">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <Trash2 className="w-4 h-4 text-destructive" />
                            Delete this file?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            <strong className="text-foreground">{pendingSingleEntry?.name}</strong> will be permanently deleted. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setPendingSingleEntry(null)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDeleteSingle}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};
