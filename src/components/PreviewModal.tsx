import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePreviewStore } from "@/stores/previewStore";
import { useExplorerStore } from "@/stores/explorerStore";
import { useDeleteQueueStore } from "@/stores/deleteQueueStore";
import { useMoveQueueStore } from "@/stores/moveQueueStore";
import {
    FileText,
    Image as ImageIcon,
    Video,
    Music,
    FileQuestion,
    ChevronLeft,
    ChevronRight,
    FolderOpen,
    Maximize2,
    Minimize2,
    ListPlus,
    ListMinus,
    FolderInput,
    RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { isVideoExtension } from "@/lib/fileTypes";
import { FilePreviewContent } from "./FilePreviewContent";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findAdjacentFile(
    entries: any[],
    fromIndex: number,
    direction: 1 | -1
): number {
    const len = entries.length;
    let i = (fromIndex + direction + len) % len;
    let steps = 0;
    while (steps < len) {
        if (!entries[i].is_dir) return i;
        i = (i + direction + len) % len;
        steps++;
    }
    return -1;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const PreviewModal = () => {
    const target = usePreviewStore((s) => s.target);
    const isOpen = usePreviewStore((s) => s.isOpen);
    const closePreview = usePreviewStore((s) => s.closePreview);
    const openPreview = usePreviewStore((s) => s.openPreview);
    const rotation = usePreviewStore((s) => s.rotation);
    const setRotation = usePreviewStore((s) => s.setRotation);
    const resetRotation = usePreviewStore((s) => s.resetRotation);

    const activeTabId = useExplorerStore((s) => s.activeTabId);
    const tabs = useExplorerStore((s) => s.tabs);

    const deleteQueue = useDeleteQueueStore((s) => s.queue);
    const addToDeleteQueue = useDeleteQueueStore((s) => s.addToQueue);
    const removeFromDeleteQueue = useDeleteQueueStore((s) => s.removeFromQueue);

    const moveQueues = useMoveQueueStore((s) => s.queues);
    const addToMoveQueue = useMoveQueueStore((s) => s.addToQueue);
    const removeFromMoveQueue = useMoveQueueStore((s) => s.removeFromQueue);
    const findQueuesContainingPath = useMoveQueueStore((s) => s.findQueuesContainingPath);

    const [selectedMoveQueueId, setSelectedMoveQueueId] = useState<string>("");
    const [isTheatrical, setIsTheatrical] = useState(false);

    // ── Derived state ──────────────────────────────────────────────────────

    const activeTab = tabs.find((t) => t.id === activeTabId);
    const currentEntries = activeTab?.type === "explorer" ? activeTab.entries : [];

    const isInDeleteQueue = target ? deleteQueue.some((e) => e.path === target.path) : false;
    const moveQueueIdsContainingTarget = target ? findQueuesContainingPath(target.path) : [];
    const isInMoveQueue = moveQueueIdsContainingTarget.length > 0;

    const ext = (target?.extension ?? "").toLowerCase();
    const isRotatable = [
        "jpg", "jpeg", "png", "webp", "svg",
    ].includes(ext) || isVideoExtension(ext);
    const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);
    const isVideo = isVideoExtension(ext);
    const isAudio = ["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(ext);
    const isText = ["txt", "md", "js", "ts", "tsx", "jsx", "json", "rs", "css", "html", "py", "sh", "yml", "yaml", "toml"].includes(ext);
    const isPdf = ext === "pdf";

    // ── Stable refs: break dependency cycle in keydown useEffect ──────────
    //
    // The keydown handler needs up-to-date `currentEntries`, `target`,
    // `rotation`, etc. but must NOT be re-registered on every render —
    // that is the primary cause of the "key-repeat storm" that hangs the
    // system. We satisfy both constraints by putting mutable values into
    // refs and reading from them inside the stable handler closure.

    const entriesRef = useRef(currentEntries);
    const targetRef = useRef(target);
    const rotationRef = useRef(rotation);
    const isTheatricalRef = useRef(isTheatrical);
    const isRotatableRef = useRef(isRotatable);

    useEffect(() => { entriesRef.current = currentEntries; }, [currentEntries]);
    useEffect(() => { targetRef.current = target; }, [target]);
    useEffect(() => { rotationRef.current = rotation; }, [rotation]);
    useEffect(() => { isTheatricalRef.current = isTheatrical; }, [isTheatrical]);
    useEffect(() => { isRotatableRef.current = isRotatable; }, [isRotatable]);

    // ── Navigation guard — prevents re-entrant / key-repeat storms ─────────
    //
    // A plain boolean ref (not state) so setting it never triggers a
    // re-render. Cleared after 150 ms — enough for React to flush the
    // openPreview state update and for the OS key-repeat debounce to settle.

    const isNavigating = useRef(false);

    // ── Effects ────────────────────────────────────────────────────────────

    // Reset theatrical mode on close
    useEffect(() => {
        if (!isOpen) setIsTheatrical(false);
    }, [isOpen]);

    // Keep selected move queue valid when queues change
    useEffect(() => {
        if (moveQueues.length === 0) {
            setSelectedMoveQueueId("");
        } else if (!selectedMoveQueueId || !moveQueues.some((q) => q.id === selectedMoveQueueId)) {
            setSelectedMoveQueueId(moveQueues[0].id);
        }
    }, [moveQueues, selectedMoveQueueId]);

    // ── Navigation ─────────────────────────────────────────────────────────

    const handleNext = useCallback(() => {
        // Guard: skip if a navigation is already in-flight (key-repeat protection)
        if (isNavigating.current) return;
        const entries = entriesRef.current;
        const tgt = targetRef.current;
        if (!tgt || !entries.length) return;

        const index = entries.findIndex((e: any) => e.path === tgt.path);
        if (index === -1) return;
        const nextIndex = findAdjacentFile(entries, index, 1);
        if (nextIndex !== -1) {
            isNavigating.current = true;
            resetRotation();
            openPreview({ ...entries[nextIndex], path: entries[nextIndex].canonical_path });
            setTimeout(() => { isNavigating.current = false; }, 150);
        }
    }, [openPreview, resetRotation]);

    const handlePrev = useCallback(() => {
        if (isNavigating.current) return;
        const entries = entriesRef.current;
        const tgt = targetRef.current;
        if (!tgt || !entries.length) return;

        const index = entries.findIndex((e: any) => e.path === tgt.path);
        if (index === -1) return;
        const prevIndex = findAdjacentFile(entries, index, -1);
        if (prevIndex !== -1) {
            isNavigating.current = true;
            resetRotation();
            openPreview({ ...entries[prevIndex], path: entries[prevIndex].canonical_path });
            setTimeout(() => { isNavigating.current = false; }, 150);
        }
    }, [openPreview, resetRotation]);

    // ── Actions ────────────────────────────────────────────────────────────

    const handleToggleDeleteQueue = useCallback(() => {
        const tgt = targetRef.current;
        if (!tgt) return;
        if (deleteQueue.some((e) => e.path === tgt.path)) {
            removeFromDeleteQueue(tgt.path);
            toast.info("Removed from delete queue");
        } else {
            addToDeleteQueue({ ...tgt, canonical_path: tgt.canonical_path || tgt.path });
            toast.success("Added to delete queue");
        }
    }, [deleteQueue, addToDeleteQueue, removeFromDeleteQueue]);

    const handleToggleMoveQueue = useCallback(() => {
        const tgt = targetRef.current;
        if (!tgt) return;
        if (isInMoveQueue) {
            moveQueueIdsContainingTarget.forEach((queueId) => removeFromMoveQueue(queueId, tgt.path));
            toast.info("Removed from move queue");
        } else {
            if (!selectedMoveQueueId) {
                toast.error("Select a move queue first");
                return;
            }
            addToMoveQueue(selectedMoveQueueId, { ...tgt, canonical_path: tgt.canonical_path || tgt.path });
            toast.success("Added to move queue");
        }
    }, [isInMoveQueue, selectedMoveQueueId, addToMoveQueue, moveQueueIdsContainingTarget, removeFromMoveQueue]);

    const handleShowInFinder = useCallback(() => {
        const tgt = targetRef.current;
        if (tgt) invoke("show_in_finder", { path: tgt.path });
    }, []);

    const handleOpenWithApp = useCallback(() => {
        const tgt = targetRef.current;
        if (tgt) invoke("open_item", { path: tgt.path });
    }, []);

    // ── Keyboard navigation ────────────────────────────────────────────────
    //
    // KEY FIX: this effect only depends on `isOpen` (a boolean).
    // All mutable values are accessed via refs, so the listener is
    // registered exactly once per open/close cycle — no churn.

    useEffect(() => {
        if (!isOpen) return;

        const onKeyDown = (e: KeyboardEvent) => {
            const noMod = !e.metaKey && !e.ctrlKey && !e.altKey;

            if (e.key === "ArrowRight" && noMod) {
                // Prevent browser scroll / text cursor movement
                e.preventDefault();
                handleNext();
            } else if (e.key === "ArrowLeft" && noMod) {
                e.preventDefault();
                handlePrev();
            } else if (e.key === "Delete" || ((e.metaKey || e.ctrlKey) && e.key === "Backspace")) {
                e.preventDefault();
                handleToggleDeleteQueue();
            } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "o") {
                e.preventDefault();
                handleOpenWithApp();
            } else if ((e.key === "f" || e.key === "F") && noMod) {
                setIsTheatrical((prev) => !prev);
            } else if (e.key === "Escape" && isTheatricalRef.current) {
                setIsTheatrical(false);
            } else if ((e.key === "r" || e.key === "R") && noMod && isRotatableRef.current) {
                setRotation((rotationRef.current + 90) % 360);
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
        // Intentionally only re-register when the modal opens/closes.
        // All other values are read from refs inside the handler.
    }, [isOpen, handleNext, handlePrev, handleToggleDeleteQueue, handleOpenWithApp, setRotation]);

    // ── Render guard ───────────────────────────────────────────────────────

    if (!target) return null;

    const currentIndex = currentEntries.findIndex((e: any) => e.path === target.path);
    const fileCount = currentEntries.filter((e: any) => !e.is_dir).length;

    // ── File type icon ─────────────────────────────────────────────────────

    const FileTypeIcon = () => {
        if (isImage) return <ImageIcon className="w-3.5 h-3.5 text-blue-400" />;
        if (isVideo) return <Video className="w-3.5 h-3.5 text-violet-400" />;
        if (isAudio) return <Music className="w-3.5 h-3.5 text-pink-400" />;
        if (isText) return <FileText className="w-3.5 h-3.5 text-amber-400" />;
        if (isPdf) return <FileText className="w-3.5 h-3.5 text-red-400" />;
        return <FileQuestion className="w-3.5 h-3.5 text-muted-foreground" />;
    };

    return (
        <Dialog open={isOpen} onOpenChange={closePreview}>
            <DialogContent
                className={cn(
                    "flex flex-col p-0 overflow-hidden outline-none",
                    "transition-[width,height,max-width,margin,border-radius] duration-300 ease-in-out",
                    isTheatrical
                        ? "w-screen h-screen max-w-none m-0 rounded-none border-0 bg-black"
                        : "sm:max-w-[900px] h-[82vh] border-border/50 bg-background/95 backdrop-blur-sm rounded-xl"
                )}
            >
                {/* ── Header ─────────────────────────────────────────────── */}
                <DialogHeader
                    className={cn(
                        "shrink-0 px-4 py-3 flex flex-row items-center justify-between space-y-0 z-50",
                        isTheatrical
                            ? "absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-200 border-b-0"
                            : "bg-muted/20 border-b"
                    )}
                >
                    <DialogTitle className="flex items-center gap-2 min-w-0 pr-4">
                        {/* File type badge */}
                        <div className={cn(
                            "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0",
                            isTheatrical ? "bg-white/10 text-white" : "bg-muted text-muted-foreground"
                        )}>
                            <FileTypeIcon />
                            <span>{ext || "file"}</span>
                        </div>
                        {/* File name */}
                        <span className={cn(
                            "text-sm font-semibold truncate",
                            isTheatrical && "text-white"
                        )}>
                            {target.name}
                        </span>
                        {/* Position indicator */}
                        {currentIndex >= 0 && fileCount > 1 && (
                            <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
                                {currentIndex + 1} / {fileCount}
                            </span>
                        )}
                    </DialogTitle>

                    <div className={cn(
                        "flex items-center gap-1 shrink-0 mr-8",
                        isTheatrical && "text-white"
                    )}>
                        {/* Rotate — only shown for rotatable types */}
                        {isRotatable && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn("h-8 w-8", isTheatrical && "text-white hover:bg-white/20")}
                                onClick={() => setRotation((rotation + 90) % 360)}
                                title="Rotate 90° (R)"
                            >
                                <RotateCw className="w-4 h-4" />
                            </Button>
                        )}

                        {/* Theater mode toggle */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn("h-8 w-8", isTheatrical && "text-white hover:bg-white/20")}
                            onClick={() => setIsTheatrical(!isTheatrical)}
                            title={isTheatrical ? "Exit Theater Mode (F)" : "Theater Mode (F)"}
                        >
                            {isTheatrical ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </Button>
                    </div>
                </DialogHeader>

                {/* ── Preview area ────────────────────────────────────────── */}
                <div className={cn(
                    "flex-1 min-h-0 flex items-center justify-center overflow-hidden",
                    isTheatrical ? "bg-black" : "bg-black/5 dark:bg-white/5"
                )}>
                    <FilePreviewContent
                        path={target.path}
                        extension={target.extension || ""}
                        name={target.name}
                        section="explorer"
                    />
                </div>

                {/* ── Footer ──────────────────────────────────────────────── */}
                <div className={cn(
                    "shrink-0 px-5 py-3 border-t flex items-center justify-between gap-4",
                    isTheatrical
                        ? "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent border-t-0 opacity-0 hover:opacity-100 transition-opacity duration-200"
                        : "bg-muted/20"
                )}>
                    {/* Left: metadata */}
                    <div className="flex items-center gap-5 text-xs shrink-0">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] uppercase font-black tracking-widest text-muted-foreground">Size</span>
                            <span className="font-semibold tabular-nums">{formatSize(target.size)}</span>
                        </div>
                        {target.modified && (
                            <div className="flex flex-col gap-0.5 border-l pl-5">
                                <span className="text-[9px] uppercase font-black tracking-widest text-muted-foreground">Modified</span>
                                <span className="font-semibold">{formatDate(target.modified)}</span>
                            </div>
                        )}
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        {/* Navigation */}
                        <div className="flex items-center rounded-lg border overflow-hidden">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-none border-r"
                                onClick={handlePrev}
                                disabled={currentEntries.length < 2}
                                title="Previous (←)"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-none"
                                onClick={handleNext}
                                disabled={currentEntries.length < 2}
                                title="Next (→)"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>

                        {/* Separator */}
                        <div className="w-px h-6 bg-border" />

                        {/* Open / Reveal */}
                        <Button
                            variant="secondary"
                            size="sm"
                            className="h-8 text-xs font-semibold"
                            onClick={handleOpenWithApp}
                            title="Open with default app (⌘O)"
                        >
                            Open
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={handleShowInFinder}
                            title="Show in Finder"
                        >
                            <FolderOpen className="h-4 w-4" />
                        </Button>

                        {/* Separator */}
                        <div className="w-px h-6 bg-border" />

                        {/* Delete queue toggle — single button, state-driven */}
                        <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                                "h-8 gap-1.5 text-xs font-semibold transition-colors",
                                isInDeleteQueue
                                    ? "border-destructive/50 text-destructive bg-destructive/5 hover:bg-destructive/10"
                                    : "hover:border-destructive/40 hover:text-destructive"
                            )}
                            onClick={handleToggleDeleteQueue}
                            title={isInDeleteQueue ? "Remove from delete queue (Del)" : "Add to delete queue (Del)"}
                        >
                            {isInDeleteQueue ? <ListMinus className="h-3.5 w-3.5" /> : <ListPlus className="h-3.5 w-3.5" />}
                            {isInDeleteQueue ? "Queued" : "Delete"}
                        </Button>

                        {/* Move queue — shown only if queues exist */}
                        {moveQueues.length > 0 && (
                            <div className="flex items-center gap-1.5">
                                {/* Queue selector — hidden when already in a queue */}
                                {!isInMoveQueue && (
                                    <Select
                                        value={selectedMoveQueueId}
                                        onValueChange={setSelectedMoveQueueId}
                                    >
                                        <SelectTrigger className="h-8 min-w-[110px] text-xs">
                                            <SelectValue placeholder="Queue" />
                                        </SelectTrigger>
                                        <SelectContent side="top">
                                            {moveQueues.map((q) => (
                                                <SelectItem key={q.id} value={q.id}>
                                                    {q.name} ({q.items.length})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                                {/* Move toggle button */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={cn(
                                        "h-8 gap-1.5 text-xs font-semibold transition-colors",
                                        isInMoveQueue
                                            ? "border-primary/50 text-primary bg-primary/5 hover:bg-primary/10"
                                            : "hover:border-primary/40 hover:text-primary"
                                    )}
                                    onClick={handleToggleMoveQueue}
                                    disabled={!isInMoveQueue && !selectedMoveQueueId}
                                    title={isInMoveQueue ? "Remove from move queue" : "Add to move queue"}
                                >
                                    {isInMoveQueue
                                        ? <><ListMinus className="h-3.5 w-3.5" /> In Queue</>
                                        : <><FolderInput className="h-3.5 w-3.5" /> Move</>
                                    }
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

// ─── Utils ───────────────────────────────────────────────────────────────────

function formatSize(bytes: number | null | undefined): string {
    if (bytes == null) return "Unknown";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let i = 0;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(ts: number | string | null | undefined): string {
    if (ts == null) return "";
    try {
        return new Date(typeof ts === "number" ? ts * 1000 : ts).toLocaleDateString(undefined, {
            month: "short", day: "numeric", year: "numeric",
        });
    } catch {
        return "";
    }
}
