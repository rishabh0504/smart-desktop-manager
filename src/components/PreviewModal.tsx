import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePreviewStore } from "@/stores/previewStore";
import { useExplorerStore } from "@/stores/explorerStore";
import { useDeleteQueueStore } from "@/stores/deleteQueueStore";
import { useMoveQueueStore } from "@/stores/moveQueueStore";
import { FileText, Image as ImageIcon, Video, Music, FileQuestion, ChevronLeft, ChevronRight, Loader2, FolderOpen, Maximize2, Minimize2, ListPlus, ListMinus, FolderInput } from "lucide-react";
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

function VideoPreview({ src, className }: { src: string; className?: string }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        el.muted = true;
        const onPlay = () => { el.muted = true; };
        el.addEventListener("play", onPlay);
        return () => el.removeEventListener("play", onPlay);
    }, [src]);
    return (
        <video
            ref={videoRef}
            controls
            src={src}
            className={className}
            autoPlay
            muted
            playsInline
        />
    );
}

export const PreviewModal = () => {
    const target = usePreviewStore((state) => state.target);
    const isOpen = usePreviewStore((state) => state.isOpen);
    const closePreview = usePreviewStore((state) => state.closePreview);
    const openPreview = usePreviewStore((state) => state.openPreview);

    const activeTabId = useExplorerStore((state) => state.activeTabId);
    const tabs = useExplorerStore((state) => state.tabs);
    const deleteQueue = useDeleteQueueStore((state) => state.queue);
    const addToDeleteQueue = useDeleteQueueStore((state) => state.addToQueue);
    const removeFromDeleteQueue = useDeleteQueueStore((state) => state.removeFromQueue);
    const moveQueues = useMoveQueueStore((state) => state.queues);
    const addToMoveQueue = useMoveQueueStore((state) => state.addToQueue);
    const removeFromMoveQueue = useMoveQueueStore((state) => state.removeFromQueue);
    const findQueuesContainingPath = useMoveQueueStore((state) => state.findQueuesContainingPath);

    const [selectedMoveQueueId, setSelectedMoveQueueId] = useState<string>("");

    const isInDeleteQueue = target && deleteQueue.some((e) => e.path === target.path);
    const moveQueueIdsContainingTarget = target ? findQueuesContainingPath(target.path) : [];
    const isInMoveQueue = moveQueueIdsContainingTarget.length > 0;

    // Get entries from the active tab to navigate
    const activeTab = tabs.find(t => t.id === activeTabId);
    const currentEntries = activeTab?.type === "explorer" ? activeTab.entries : [];

    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [isTheatrical, setIsTheatrical] = useState(false);

    // Reset theatrical mode when closed
    useEffect(() => {
        if (!isOpen) setIsTheatrical(false);
    }, [isOpen]);

    // Keep selected move queue valid
    useEffect(() => {
        if (moveQueues.length === 0) setSelectedMoveQueueId("");
        else if (!selectedMoveQueueId || !moveQueues.some((q) => q.id === selectedMoveQueueId))
            setSelectedMoveQueueId(moveQueues[0].id);
    }, [moveQueues, selectedMoveQueueId]);

    const handleNext = useCallback(() => {
        if (!target || !currentEntries.length) return;
        const index = currentEntries.findIndex((e: any) => e.path === target.path);
        if (index === -1) return;

        const nextIndex = (index + 1) % currentEntries.length;
        let i = nextIndex;
        let loops = 0;
        while (currentEntries[i].is_dir && loops < currentEntries.length) {
            i = (i + 1) % currentEntries.length;
            loops++;
        }

        if (!currentEntries[i].is_dir) {
            openPreview({ ...currentEntries[i], path: currentEntries[i].canonical_path });
        }
    }, [target, currentEntries, openPreview]);

    const handlePrev = useCallback(() => {
        if (!target || !currentEntries.length) return;
        const index = currentEntries.findIndex((e: any) => e.path === target.path);
        if (index === -1) return;

        let prevIndex = (index - 1 + currentEntries.length) % currentEntries.length;
        let i = prevIndex;
        let loops = 0;
        while (currentEntries[i].is_dir && loops < currentEntries.length) {
            i = (i - 1 + currentEntries.length) % currentEntries.length;
            loops++;
        }

        if (!currentEntries[i].is_dir) {
            openPreview({ ...currentEntries[i], path: currentEntries[i].canonical_path });
        }
    }, [target, currentEntries, openPreview]);

    const handleAddToDeleteQueue = useCallback(() => {
        if (!target) return;
        addToDeleteQueue({ ...target, path: target.path, canonical_path: target.canonical_path || target.path });
        toast.success("Added to delete queue");
    }, [target, addToDeleteQueue]);

    const handleRemoveFromDeleteQueue = useCallback(() => {
        if (!target) return;
        removeFromDeleteQueue(target.path);
        toast.success("Removed from delete queue");
    }, [target, removeFromDeleteQueue]);

    const handleAddToMoveQueue = useCallback(() => {
        if (!target || !selectedMoveQueueId) return;
        addToMoveQueue(selectedMoveQueueId, { ...target, path: target.path, canonical_path: target.canonical_path || target.path });
        toast.success("Added to move queue");
    }, [target, selectedMoveQueueId, addToMoveQueue]);

    const handleRemoveFromMoveQueue = useCallback(() => {
        if (!target) return;
        moveQueueIdsContainingTarget.forEach((queueId) => removeFromMoveQueue(queueId, target.path));
        toast.success("Removed from move queue(s)");
    }, [target, moveQueueIdsContainingTarget, removeFromMoveQueue]);

    const handleShowInFinder = () => {
        if (target) {
            invoke("show_in_finder", { path: target.path });
        }
    };

    const handleOpenWithApp = useCallback(() => {
        if (target) {
            invoke("open_item", { path: target.path });
        }
    }, [target]);

    const ext = target?.extension?.toLowerCase() || "";
    const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);
    const isVideo = isVideoExtension(ext);
    const isAudio = ["mp3", "wav", "ogg", "flac"].includes(ext);
    const isText = ["txt", "md", "js", "ts", "json", "rs", "css", "html", "py", "sh", "yml", "yaml"].includes(ext);
    const isPdf = ext === "pdf";

    useEffect(() => {
        if (!target || !isOpen) {
            setContent(null);
            setPreviewError(null);
            return;
        }

        setLoading(true);
        setPreviewError(null);

        if (isText) {
            invoke<string>("get_file_text_content", { path: target.path })
                .then((c) => { setContent(c); setPreviewError(null); })
                .catch((err: unknown) => {
                    const msg = typeof err === "string" ? err : (err as Error)?.message ?? "Failed to load file";
                    setPreviewError(msg);
                    setContent(null);
                })
                .finally(() => setLoading(false));
        } else if (isPdf) {
            invoke<string>("get_file_base64_content", { path: target.path })
                .then((c) => { setContent(c); setPreviewError(null); })
                .catch((err: unknown) => {
                    const msg = typeof err === "string" ? err : (err as Error)?.message ?? "Failed to load file";
                    setPreviewError(msg);
                    setContent(null);
                })
                .finally(() => setLoading(false));
        } else if (isImage || isVideo || isAudio) {
            setContent(`vmedia://localhost/${encodeURIComponent(target.path)}`);
            setLoading(false);
        } else {
            setLoading(false);
        }
    }, [target, isOpen, isText, isPdf, isImage, isVideo, isAudio]);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight") {
                handleNext();
            } else if (e.key === "ArrowLeft") {
                handlePrev();
            } else             if (e.key === "Delete" || ((e.metaKey || e.ctrlKey) && e.key === "Backspace")) {
                e.preventDefault();
                handleAddToDeleteQueue();
            } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "o") {
                e.preventDefault();
                handleOpenWithApp();
            } else if (e.key === "f" || e.key === "F") {
                // Toggle theatrical mode with 'f'
                if (!e.metaKey && !e.ctrlKey && !e.altKey) {
                    setIsTheatrical(prev => !prev);
                }
            } else if (e.key === "Escape") {
                if (isTheatrical) {
                    setIsTheatrical(false);
                    // Prevent closing dialog if getting out of theatrical mode? 
                    // Standard behavior is usually Esc closes fullscreen, then Esc closes modal.
                    // But here Dialog handles Esc. We might need to stop propagation if we want to catch it.
                    // However, let's keep it simple: Esc always closes modal for now, unless we want to trap it.
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, handleNext, handlePrev, handleAddToDeleteQueue, isTheatrical]);

    if (!target) return null;

    const mediaSrc = content || null;

    return (
        <Dialog open={isOpen} onOpenChange={closePreview}>
            <DialogContent
                className={cn(
                    "flex flex-col p-0 overflow-hidden bg-background/95 backdrop-blur-sm outline-none transition-all duration-500 ease-in-out",
                    isTheatrical
                        ? "w-screen h-screen max-w-none m-0 rounded-none border-0"
                        : "sm:max-w-[900px] h-[80vh] border-border/50"
                )}
            >
                <DialogHeader className={cn(
                    "p-4 flex flex-row items-center justify-between space-y-0 z-50 transition-colors",
                    isTheatrical ? "bg-black/80 text-white border-b-0 absolute top-0 left-0 right-0 hover:opacity-100 opacity-0 transition-opacity duration-300" : "bg-muted/30 border-b"
                )}>
                    <DialogTitle className="flex items-center gap-2 truncate pr-8 text-sm font-semibold">
                        {isImage && <ImageIcon className="w-4 h-4 text-blue-500" />}
                        {isVideo && <Video className="w-4 h-4 text-purple-500" />}
                        {isAudio && <Music className="w-4 h-4 text-pink-500" />}
                        {isText && <FileText className="w-4 h-4 text-orange-500" />}
                        {isPdf && <FileText className="w-4 h-4 text-red-500" />}
                        {(!isImage && !isVideo && !isAudio && !isText && !isPdf) && <FileQuestion className="w-4 h-4 text-muted-foreground" />}
                        {target.name}
                    </DialogTitle>

                    <div className="flex items-center gap-2 mr-8 relative z-[60]">
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn("h-8 w-8", isTheatrical && "text-white hover:bg-white/20")}
                            onClick={() => setIsTheatrical(!isTheatrical)}
                            title={isTheatrical ? "Exit Theater Mode" : "Enter Theater Mode"}
                        >
                            {isTheatrical ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </Button>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-auto relative group flex items-center justify-center bg-black/5 dark:bg-white/5 p-4 data-[theatrical=true]:bg-black data-[theatrical=true]:p-0" data-theatrical={isTheatrical}>
                    {previewError && (
                        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center max-w-md">
                            <FileQuestion className="w-12 h-12 text-amber-500" />
                            <p className="text-sm font-medium text-muted-foreground">{previewError}</p>
                            <p className="text-xs text-muted-foreground/80">Use &quot;Open with App&quot; below to open this file.</p>
                        </div>
                    )}
                    {loading && !previewError && (
                        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm transition-all duration-300">
                            <div className="flex items-center gap-3 text-primary animate-pulse font-medium bg-background/80 px-6 py-3 rounded-full shadow-lg border">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span>Streaming Content...</span>
                            </div>
                        </div>
                    )}
                    {isImage && mediaSrc && !previewError && (
                        <img
                            src={mediaSrc}
                            alt={target.name}
                            className="max-w-full max-h-full object-contain shadow-2xl rounded-sm"
                            loading="lazy"
                        />
                    )}

                    {isVideo && mediaSrc && !previewError && (
                        <VideoPreview src={mediaSrc} className="w-full h-full object-contain shadow-2xl rounded-sm" />
                    )}

                    {isAudio && !previewError && (
                        <div className="flex flex-col items-center gap-6">
                            <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                                <Music className="w-16 h-16 text-primary/50" />
                            </div>
                            <audio controls src={mediaSrc || undefined} className="w-80 shadow-lg" autoPlay muted />
                        </div>
                    )}

                    {isText && content && !previewError && (
                        <div className="w-full h-full p-6 font-mono text-xs bg-muted/20 border rounded-lg whitespace-pre overflow-auto select-text scrollbar-thin scrollbar-thumb-muted-foreground/20">
                            {content}
                        </div>
                    )}

                    {isPdf && content && !previewError && (
                        <embed
                            src={content}
                            type="application/pdf"
                            className="w-full h-full rounded-sm shadow-xl"
                        />
                    )}

                    {!isImage && !isVideo && !isAudio && !isText && !isPdf && !loading && !previewError && (
                        <div className="flex flex-col items-center gap-4 text-muted-foreground bg-muted/20 p-8 rounded-xl border border-dashed">
                            <FileQuestion className="w-16 h-16 opacity-50" />
                            <div className="text-center">
                                <p className="text-sm font-medium">No preview available for this file type.</p>
                                <p className="text-xs opacity-70 mt-1 max-w-[300px] truncate">{target.path}</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-3 border-t bg-muted/30 flex justify-between items-center px-6">
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Size</span>
                            <span className="text-xs font-medium">{formatSize(target.size)}</span>
                        </div>
                        <div className="flex flex-col border-l pl-6">
                            <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Type</span>
                            <span className="text-xs font-medium uppercase">{ext || "Unknown"}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={handlePrev}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleNext}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button variant="secondary" size="sm" className="ml-2 font-medium" onClick={handleOpenWithApp}>
                            Open with App
                        </Button>
                        <Button
                            variant="secondary"
                            size="icon"
                            className="h-8 w-8 ml-2"
                            onClick={handleShowInFinder}
                            title="Show in Finder"
                        >
                            <FolderOpen className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 ml-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={handleAddToDeleteQueue}
                            title="Add to delete queue"
                        >
                            <ListPlus className="h-4 w-4" />
                        </Button>
                        {isInDeleteQueue && (
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 ml-2 text-destructive hover:bg-destructive/10"
                                onClick={handleRemoveFromDeleteQueue}
                                title="Remove from delete queue"
                            >
                                <ListMinus className="h-4 w-4" />
                            </Button>
                        )}
                        {moveQueues.length > 0 && (
                            <>
                                <Select value={selectedMoveQueueId} onValueChange={setSelectedMoveQueueId}>
                                    <SelectTrigger className="h-8 min-w-[120px] text-xs" title="Move queue">
                                        <SelectValue placeholder="Queue" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {moveQueues.map((q) => (
                                            <SelectItem key={q.id} value={q.id}>
                                                {q.name} ({q.items.length})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1 text-primary"
                                    onClick={handleAddToMoveQueue}
                                    disabled={!selectedMoveQueueId}
                                    title="Add to move queue"
                                >
                                    <FolderInput className="h-4 w-4" />
                                    Add to move
                                </Button>
                            </>
                        )}
                        {isInMoveQueue && (
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 text-primary hover:bg-primary/10"
                                onClick={handleRemoveFromMoveQueue}
                                title="Remove from move queue"
                            >
                                <ListMinus className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

function formatSize(bytes: number | null): string {
    if (bytes === null) return "Unknown";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
