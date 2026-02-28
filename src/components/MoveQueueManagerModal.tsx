import { useState, useMemo, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    Check,
    FileIcon,
    ChevronRight,
    ChevronDown,
    FolderSearch,
    MoveRight,
    ListX,
    Package2,
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

// ─── Types ───────────────────────────────────────────────────────────────────

interface MoveQueueManagerModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type SelectedFile = { queueId: string; path: string };

// ─── Palette — stable hues for each queue ────────────────────────────────────

const QUEUE_HUES = [210, 150, 30, 280, 340, 175, 55, 0];

function queueHue(index: number) {
    return QUEUE_HUES[index % QUEUE_HUES.length];
}

// ─── Component ───────────────────────────────────────────────────────────────

export const MoveQueueManagerModal = ({ open: isOpen, onOpenChange }: MoveQueueManagerModalProps) => {
    const { queues, updateQueue, removeQueue, moveItemToQueue } = useMoveQueueStore();
    const refresh = useExplorerStore((s) => s.refresh);
    const tabs = useExplorerStore((s) => s.tabs);

    // ── UI state ──────────────────────────────────────────────────────────
    const [movingQueueId, setMovingQueueId] = useState<string | null>(null);
    // Bug fix #10: default-expand ALL queues on open
    const [expandedQueues, setExpandedQueues] = useState<Set<string>>(new Set());
    const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
    const [moveToQueueId, setMoveToQueueId] = useState<string>("");
    const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
    const [moveProgress, setMoveProgress] = useState<{ processed: number; total: number } | null>(null);

    // Bug fix #6: inline confirmation state instead of window.confirm
    const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

    // Bug fix #7: inline rename state instead of window.prompt
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const renameInputRef = useRef<HTMLInputElement>(null);

    const moveSuccessCount = useRef(0);

    // Bug fix #10: expand all queues when modal opens or queues change
    useEffect(() => {
        if (isOpen) {
            setExpandedQueues(new Set(queues.map((q) => q.id)));
        }
    }, [isOpen, queues.length]);

    // Focus rename input when it appears
    useEffect(() => {
        if (renamingId && renameInputRef.current) {
            renameInputRef.current.focus();
            renameInputRef.current.select();
        }
    }, [renamingId]);

    // ── Computed ──────────────────────────────────────────────────────────
    const selectedQueue = useMemo(
        () => (selectedFile ? queues.find((q) => q.id === selectedFile.queueId) : null),
        [queues, selectedFile]
    );
    const selectedEntry = useMemo((): FileEntry | null => {
        if (!selectedFile || !selectedQueue) return null;
        return selectedQueue.items.find((e) => e.path === selectedFile.path) ?? null;
    }, [selectedFile, selectedQueue]);

    // Bug fix #11: For single-file routing, only show OTHER queues.
    // For bulk, also exclude queues that already contain those items (best-effort).
    const otherQueuesForMove = useMemo(
        () => (selectedFile ? queues.filter((q) => q.id !== selectedFile.queueId) : []),
        [queues, selectedFile]
    );

    const totalItems = useMemo(() => queues.reduce((s, q) => s + q.items.length, 0), [queues]);

    // ── Helpers ───────────────────────────────────────────────────────────
    const toggleQueueExpanded = (queueId: string) => {
        setExpandedQueues((prev) => {
            const next = new Set(prev);
            next.has(queueId) ? next.delete(queueId) : next.add(queueId);
            return next;
        });
    };

    const refreshAllTabs = () => {
        tabs.forEach((tab) => {
            if (tab.type === "explorer" || tab.type === "search_results") refresh(tab.id);
        });
    };

    // ── Rename inline (bug fix #7) ────────────────────────────────────────
    const startRename = (queueId: string, currentName: string) => {
        setRenamingId(queueId);
        setRenameValue(currentName);
    };

    const commitRename = (queueId: string) => {
        const name = renameValue.trim();
        if (name) {
            updateQueue(queueId, { name });
            toast.success("Queue renamed");
        }
        setRenamingId(null);
        setRenameValue("");
    };

    // ── Set destination folder ────────────────────────────────────────────
    const handleSetFolder = async (queueId: string) => {
        const folder = await open({ directory: true, title: "Destination folder" });
        if (folder === null || (Array.isArray(folder) && folder.length === 0)) return;
        const path = Array.isArray(folder) ? folder[0] : folder;
        updateQueue(queueId, { folderPath: path });
        toast.success("Destination updated");
    };

    // ── Move all ──────────────────────────────────────────────────────────
    const handleMoveAll = async (queueId: string) => {
        const queue = useMoveQueueStore.getState().getQueue(queueId);
        if (!queue || queue.items.length === 0) return;
        if (!queue.folderPath) {
            toast.error(`Set a destination folder for "${queue.name}" first.`);
            return;
        }
        setMovingQueueId(queueId);
        const operationId = crypto.randomUUID();
        moveSuccessCount.current = 0;

        const unlistenItem = await listen<{ operation_id: string; path: string }>("batch_item_completed", (ev) => {
            if (ev.payload.operation_id === operationId) {
                useMoveQueueStore.getState().removeFromQueue(queueId, ev.payload.path);
                moveSuccessCount.current++;
            }
        });
        const unlistenProgress = await listen("batch_progress", (ev: any) => {
            const d = ev.payload;
            if (d.operation_id === operationId) {
                setMoveProgress({ processed: d.processed_items, total: d.total_items });
            }
        });

        try {
            await invoke("batch_move", {
                operationId,
                sources: queue.items.map((e) => e.path),
                destinationDir: queue.folderPath,
            });
            refreshAllTabs();
            const c = moveSuccessCount.current;
            if (c > 0) toast.success(`Moved ${c} item(s) to ${queue.folderPath}`);
        } catch (e) {
            const c = moveSuccessCount.current;
            c > 0 ? toast.warning(`Moved ${c} item(s); some failed.`) : toast.error(`Move failed: ${e}`);
            refreshAllTabs();
        } finally {
            setMovingQueueId(null);
            setMoveProgress(null);
            unlistenItem();
            unlistenProgress();
        }
    };

    // ── Item routing ──────────────────────────────────────────────────────
    const handleMoveItemToQueue = () => {
        if (!selectedFile || !moveToQueueId) return;
        moveItemToQueue(selectedFile.queueId, moveToQueueId, selectedFile.path);
        toast.success("File moved to queue");
        setMoveToQueueId("");
        setSelectedFile(null);
    };

    // Bug fix #11: bulk move — only targets queues different from source queues
    const handleBulkMoveToQueue = () => {
        if (bulkSelected.size === 0 || !moveToQueueId) return;
        let count = 0;
        bulkSelected.forEach((path) => {
            const srcQueueId = queues.find((q) => q.items.some((i) => i.path === path))?.id;
            // Don't move to same queue
            if (srcQueueId && srcQueueId !== moveToQueueId) {
                moveItemToQueue(srcQueueId, moveToQueueId, path);
                count++;
            }
        });
        toast.success(`Moved ${count} file(s) to queue`);
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
            const queueId = queues.find((q) => q.items.some((i) => i.path === path))?.id;
            if (queueId) { useMoveQueueStore.getState().removeFromQueue(queueId, path); count++; }
        });
        toast.success(`Dequeued ${count} item(s)`);
        setBulkSelected(new Set());
        setSelectedFile(null);
    };

    const toggleBulk = (path: string) => {
        setBulkSelected((prev) => {
            const next = new Set(prev);
            next.has(path) ? next.delete(path) : next.add(path);
            return next;
        });
    };

    // ─────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────
    return (
        <>
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-6xl w-[92vw] h-[88vh] overflow-hidden flex flex-col rounded-2xl p-0 gap-0 shadow-2xl border border-border/60">

                    {/* ── Header ─────────────────────────────────────────── */}
                    <DialogHeader className="px-5 py-3.5 border-b shrink-0 bg-gradient-to-r from-primary/6 via-background to-background">
                        <DialogTitle className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/12 ring-1 ring-primary/20 shrink-0">
                                <FolderInput className="w-4 h-4 text-primary" />
                            </div>
                            <span className="font-semibold text-base">Move queue manager</span>
                            {/* Summary chips */}
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-muted text-muted-foreground">
                                {queues.length} queue{queues.length !== 1 ? "s" : ""}
                            </span>
                            {totalItems > 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary/12 text-primary">
                                    {totalItems} item{totalItems !== 1 ? "s" : ""}
                                </span>
                            )}
                            {bulkSelected.size > 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 animate-in fade-in">
                                    {bulkSelected.size} selected
                                </span>
                            )}
                        </DialogTitle>
                    </DialogHeader>

                    {/* ── Body ───────────────────────────────────────────── */}
                    {queues.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-12 text-center">
                            <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center">
                                <Package2 className="w-8 h-8 text-muted-foreground/40" />
                            </div>
                            <div>
                                <p className="font-semibold text-sm">No move queues</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Right-click a folder → <em>Use as move destination</em> to create one.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 grid grid-cols-[minmax(280px,_1fr)_minmax(340px,_1.5fr)] min-h-0 overflow-hidden">

                            {/* ── LEFT: Queue + file tree ─────────────────── */}
                            <div className="border-r flex flex-col min-w-0 min-h-0 bg-muted/5">
                                <div className="px-4 py-2 border-b flex items-center gap-2 bg-muted/10">
                                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex-1">
                                        Queues &amp; files
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-[10px] px-2 text-muted-foreground"
                                        onClick={() =>
                                            setExpandedQueues((prev) =>
                                                prev.size === queues.length
                                                    ? new Set()
                                                    : new Set(queues.map((q) => q.id))
                                            )
                                        }
                                    >
                                        {expandedQueues.size === queues.length ? "Collapse all" : "Expand all"}
                                    </Button>
                                </div>
                                <ScrollArea className="flex-1">
                                    <ul className="p-2 space-y-1">
                                        {queues.map((q, qi) => {
                                            const hue = queueHue(qi);
                                            const isExpanded = expandedQueues.has(q.id);
                                            const isMoving = movingQueueId === q.id;
                                            const progressPct = isMoving && moveProgress
                                                ? Math.round((moveProgress.processed / moveProgress.total) * 100)
                                                : 0;
                                            return (
                                                <li key={q.id} className="rounded-xl overflow-hidden border border-transparent hover:border-border/50 transition-colors">
                                                    {/* Queue row */}
                                                    <div
                                                        className={cn(
                                                            "flex items-center gap-2 py-2 px-2.5 cursor-pointer rounded-xl",
                                                            isExpanded ? "bg-muted/30" : "hover:bg-muted/20"
                                                        )}
                                                    >
                                                        {/* Color dot */}
                                                        <div
                                                            className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/20"
                                                            style={{ backgroundColor: `hsl(${hue}, 70%, 55%)` }}
                                                        />

                                                        {/* Expand toggle */}
                                                        <button
                                                            type="button"
                                                            className="p-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                                                            onClick={() => toggleQueueExpanded(q.id)}
                                                            aria-expanded={isExpanded}
                                                        >
                                                            {isExpanded
                                                                ? <ChevronDown className="w-3.5 h-3.5" />
                                                                : <ChevronRight className="w-3.5 h-3.5" />
                                                            }
                                                        </button>

                                                        {/* Name (inline edit on rename) */}
                                                        <div className="flex-1 min-w-0 flex flex-col" onClick={() => toggleQueueExpanded(q.id)}>
                                                            {renamingId === q.id ? (
                                                                <Input
                                                                    ref={renameInputRef}
                                                                    value={renameValue}
                                                                    onChange={(e) => setRenameValue(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === "Enter") commitRename(q.id);
                                                                        else if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); }
                                                                    }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="h-6 text-xs px-1.5 py-0 font-semibold"
                                                                />
                                                            ) : (
                                                                <>
                                                                    <span className="text-sm font-semibold truncate" title={q.name}>
                                                                        {q.name}
                                                                    </span>
                                                                    {q.folderPath && (
                                                                        <span
                                                                            className="text-[10px] text-muted-foreground/60 truncate"
                                                                            title={q.folderPath}
                                                                        >
                                                                            → {q.folderPath.split(/[\/\\]/).filter(Boolean).pop() ?? q.folderPath}
                                                                        </span>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>

                                                        {/* Item count badge */}
                                                        <span
                                                            className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums"
                                                            style={{
                                                                backgroundColor: `hsl(${hue}, 70%, 55%, 0.15)`,
                                                                color: `hsl(${hue}, 60%, 45%)`,
                                                            }}
                                                        >
                                                            {q.items.length}
                                                        </span>

                                                        {/* Queue actions */}
                                                        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                            {renamingId === q.id ? (
                                                                <Button
                                                                    variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:bg-green-500/10"
                                                                    onClick={() => commitRename(q.id)}
                                                                    title="Save name (Enter)"
                                                                >
                                                                    <Check className="w-3.5 h-3.5" />
                                                                </Button>
                                                            ) : (
                                                                /* Bug fix #7: inline rename */
                                                                <Button
                                                                    variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                                    onClick={() => startRename(q.id, q.name)}
                                                                    title="Rename queue"
                                                                >
                                                                    <Pencil className="w-3.5 h-3.5" />
                                                                </Button>
                                                            )}
                                                            <Button
                                                                variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                                onClick={() => handleSetFolder(q.id)}
                                                                title="Change destination folder"
                                                            >
                                                                <FolderSearch className="w-3.5 h-3.5" />
                                                            </Button>

                                                            {/* Bug fix #8: tooltip wrapper for disabled "Move all" */}
                                                            <span
                                                                title={
                                                                    !q.folderPath
                                                                        ? "Set a destination folder first (click the folder icon)"
                                                                        : q.items.length === 0
                                                                            ? "Queue is empty"
                                                                            : `Move all ${q.items.length} item(s) → ${q.folderPath}`
                                                                }
                                                            >
                                                                <Button
                                                                    variant="default"
                                                                    size="sm"
                                                                    className="h-7 text-xs px-2 font-semibold"
                                                                    disabled={q.items.length === 0 || movingQueueId !== null || !q.folderPath}
                                                                    onClick={() => handleMoveAll(q.id)}
                                                                >
                                                                    {isMoving ? (
                                                                        <span className="flex items-center gap-1.5 min-w-[52px] justify-center">
                                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                                            {moveProgress && (
                                                                                <span className="text-[9px] tabular-nums font-bold">
                                                                                    {moveProgress.processed}/{moveProgress.total}
                                                                                </span>
                                                                            )}
                                                                        </span>
                                                                    ) : !q.folderPath ? (
                                                                        <span className="opacity-60">Set dest…</span>
                                                                    ) : (
                                                                        <span className="flex items-center gap-1">
                                                                            <MoveRight className="w-3 h-3" /> Move all
                                                                        </span>
                                                                    )}
                                                                </Button>
                                                            </span>

                                                            {/* Bug fix #6: no window.confirm — sets confirmRemoveId instead */}
                                                            <Button
                                                                variant="ghost" size="icon"
                                                                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                                                onClick={() => setConfirmRemoveId(q.id)}
                                                                title="Remove queue"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    {/* Progress bar when moving */}
                                                    {isMoving && moveProgress && (
                                                        <div className="px-3 pb-2">
                                                            <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
                                                                <div
                                                                    className="h-full rounded-full transition-all duration-300"
                                                                    style={{
                                                                        width: `${progressPct}%`,
                                                                        backgroundColor: `hsl(${hue}, 70%, 55%)`,
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Expanded file list */}
                                                    {isExpanded && (
                                                        <ul className="pl-7 pr-2 pb-2 space-y-0.5">
                                                            {q.items.length === 0 ? (
                                                                <li className="text-[11px] text-muted-foreground/50 py-1.5 px-2 italic">
                                                                    Queue is empty
                                                                </li>
                                                            ) : (
                                                                q.items.map((item) => {
                                                                    const isSelected =
                                                                        selectedFile?.queueId === q.id && selectedFile?.path === item.path;
                                                                    const isBulked = bulkSelected.has(item.path);
                                                                    return (
                                                                        <li key={item.path}>
                                                                            <button
                                                                                type="button"
                                                                                className={cn(
                                                                                    "w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-left text-sm transition-colors group",
                                                                                    isSelected
                                                                                        ? "bg-primary/12 text-primary ring-1 ring-primary/20"
                                                                                        : isBulked
                                                                                            ? "bg-amber-500/8 ring-1 ring-amber-500/20"
                                                                                            : "hover:bg-muted/40"
                                                                                )}
                                                                                onClick={() => setSelectedFile({ queueId: q.id, path: item.path })}
                                                                            >
                                                                                <Checkbox
                                                                                    checked={isBulked}
                                                                                    onCheckedChange={() => toggleBulk(item.path)}
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                    className="h-3.5 w-3.5 shrink-0"
                                                                                />
                                                                                <FileIcon className={cn("w-3.5 h-3.5 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                                                                                <span className="truncate min-w-0 text-[13px]" title={item.path}>
                                                                                    {item.name}
                                                                                </span>
                                                                                {/* Dequeue on hover */}
                                                                                <button
                                                                                    type="button"
                                                                                    className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                                                                    onClick={(e) => { e.stopPropagation(); handleRemoveItem(q.id, item.path); }}
                                                                                    title="Remove from queue"
                                                                                >
                                                                                    <Trash2 className="w-3 h-3" />
                                                                                </button>
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

                            {/* ── RIGHT: Preview + routing ─────────────────── */}
                            <div className="flex flex-col min-w-0 bg-muted/5">
                                <div className="px-4 py-2 border-b flex items-center justify-between bg-muted/10">
                                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                                        Preview &amp; routing
                                    </span>
                                </div>

                                <ScrollArea className="flex-1">
                                    <div className="p-4 flex flex-col gap-4 min-h-full">

                                        {/* ── Bulk actions view ─────────── */}
                                        {bulkSelected.size > 1 ? (
                                            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-background border rounded-xl shadow-sm gap-6">
                                                <div className="w-16 h-16 rounded-full bg-amber-500/12 flex items-center justify-center">
                                                    <FolderInput className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-bold mb-1">Batch actions</h3>
                                                    <p className="text-sm text-muted-foreground">
                                                        {bulkSelected.size} files selected across your queues
                                                    </p>
                                                </div>

                                                <div className="w-full max-w-sm space-y-3">
                                                    {/* Move to queue */}
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
                                                        <Button disabled={!moveToQueueId} onClick={handleBulkMoveToQueue} className="gap-1.5">
                                                            <MoveRight className="w-4 h-4" />
                                                            Move {bulkSelected.size}
                                                        </Button>
                                                    </div>

                                                    {/* Divider */}
                                                    <div className="relative flex items-center">
                                                        <div className="flex-1 h-px bg-border" />
                                                        <span className="px-3 text-[11px] uppercase tracking-wider text-muted-foreground">or</span>
                                                        <div className="flex-1 h-px bg-border" />
                                                    </div>

                                                    {/* Bulk dequeue */}
                                                    <Button
                                                        variant="destructive"
                                                        className="w-full gap-1.5"
                                                        onClick={handleBulkRemove}
                                                    >
                                                        <ListX className="w-4 h-4" />
                                                        Dequeue {bulkSelected.size} items
                                                    </Button>
                                                </div>
                                            </div>

                                        ) : !selectedEntry ? (
                                            /* ── Empty / no selection ─── */
                                            <div className="flex-1 flex flex-col items-center justify-center p-10 bg-background border rounded-xl text-muted-foreground text-center gap-3">
                                                <div className="w-14 h-14 rounded-full bg-muted/30 flex items-center justify-center">
                                                    <FileIcon className="w-7 h-7 opacity-30" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium">Select a file to preview</p>
                                                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                                                        Click any file from the tree to preview and route it
                                                    </p>
                                                </div>
                                            </div>

                                        ) : (
                                            /* ── Single file detail ────── */
                                            <div className="flex flex-col gap-4">
                                                {/* File preview */}
                                                <section className="shrink-0 flex flex-col gap-2">
                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                        Content preview
                                                    </p>
                                                    <div className="rounded-xl border bg-background overflow-hidden shadow-sm flex items-center justify-center min-h-[200px] max-h-[340px]">
                                                        <FilePreviewContent
                                                            path={selectedEntry.path}
                                                            extension={selectedEntry.extension || ""}
                                                            name={selectedEntry.name}
                                                            section="explorer"
                                                        />
                                                    </div>
                                                </section>

                                                {/* Metadata card */}
                                                <section className="bg-background border rounded-xl shadow-sm overflow-hidden shrink-0">
                                                    {/* Card header accent */}
                                                    {selectedQueue && (
                                                        <div
                                                            className="h-1 w-full"
                                                            style={{
                                                                backgroundColor: `hsl(${queueHue(queues.findIndex((q) => q.id === selectedQueue.id))}, 70%, 55%)`,
                                                            }}
                                                        />
                                                    )}
                                                    <div className="p-4 space-y-4">
                                                        {/* File info */}
                                                        <div className="grid grid-cols-[1fr_auto] gap-4">
                                                            <div className="flex flex-col min-w-0 gap-1">
                                                                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">File</span>
                                                                <span className="text-sm font-semibold font-mono truncate">{selectedEntry.name}</span>
                                                                <span
                                                                    className="text-[10px] font-mono text-muted-foreground/60 truncate"
                                                                    title={selectedEntry.path}
                                                                >
                                                                    {selectedEntry.path}
                                                                </span>
                                                                {selectedQueue && (
                                                                    <div className="mt-2 flex flex-wrap gap-3">
                                                                        <div className="flex items-center gap-1.5 text-[11px]">
                                                                            <span className="text-muted-foreground/60 uppercase font-semibold tracking-wide">Queue</span>
                                                                            <span className="font-bold">{selectedQueue.name}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5 text-[11px]">
                                                                            <span className="text-muted-foreground/60 uppercase font-semibold tracking-wide">Target</span>
                                                                            <span className="font-mono truncate" title={selectedQueue.folderPath}>
                                                                                {selectedQueue.folderPath || <span className="italic opacity-50">unset</span>}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Quick actions column */}
                                                            <div className="flex flex-col gap-1.5 shrink-0 border-l pl-4 justify-center">
                                                                <Button
                                                                    variant="outline" size="sm" className="h-7 text-[11px] w-full justify-start gap-1.5"
                                                                    onClick={() => invoke("show_in_finder", { path: selectedEntry.path })}
                                                                >
                                                                    <FolderOpen className="w-3 h-3" /> Reveal
                                                                </Button>
                                                                <Button
                                                                    variant="outline" size="sm" className="h-7 text-[11px] w-full justify-start gap-1.5"
                                                                    onClick={() => invoke("open_item", { path: selectedEntry.path })}
                                                                >
                                                                    <FolderInput className="w-3 h-3" /> Open OS
                                                                </Button>
                                                                <Button
                                                                    variant="outline" size="sm"
                                                                    className="h-7 text-[11px] w-full justify-start gap-1.5 text-destructive hover:bg-destructive/10 border-destructive/30"
                                                                    onClick={() => handleRemoveItem(selectedQueue!.id, selectedEntry.path)}
                                                                >
                                                                    <Trash2 className="w-3 h-3" /> Dequeue
                                                                </Button>
                                                            </div>
                                                        </div>

                                                        {/* Route to another queue */}
                                                        {otherQueuesForMove.length > 0 && (
                                                            <div className="flex items-center gap-2 pt-3 border-t">
                                                                <span className="text-[10px] font-bold uppercase text-muted-foreground shrink-0 tracking-wider">
                                                                    Route to
                                                                </span>
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
                                                                <Button
                                                                    size="sm" className="h-8 gap-1.5"
                                                                    disabled={!moveToQueueId}
                                                                    onClick={handleMoveItemToQueue}
                                                                >
                                                                    <MoveRight className="w-3.5 h-3.5" />
                                                                    Move file
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>
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

            {/* ── Confirm remove queue (bug fix #6: no window.confirm) ─────── */}
            <AlertDialog
                open={confirmRemoveId !== null}
                onOpenChange={(o) => { if (!o) setConfirmRemoveId(null); }}
            >
                <AlertDialogContent className="rounded-2xl max-w-sm">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <Trash2 className="w-4 h-4 text-destructive" />
                            Remove queue?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            <strong className="text-foreground">
                                {queues.find((q) => q.id === confirmRemoveId)?.name ?? "This queue"}
                            </strong>{" "}
                            and all its {queues.find((q) => q.id === confirmRemoveId)?.items.length ?? 0} queued item(s) will be removed. The files themselves will not be deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setConfirmRemoveId(null)}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                            onClick={() => {
                                if (confirmRemoveId) {
                                    removeQueue(confirmRemoveId);
                                    if (selectedFile?.queueId === confirmRemoveId) setSelectedFile(null);
                                    toast.success("Queue removed");
                                }
                                setConfirmRemoveId(null);
                            }}
                        >
                            Remove queue
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};
