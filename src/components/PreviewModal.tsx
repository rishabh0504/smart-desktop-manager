import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePreviewStore } from "@/stores/previewStore";
import { useExplorerStore } from "@/stores/explorerStore";
import { useDeleteQueueStore } from "@/stores/deleteQueueStore";
import { useMoveQueueStore } from "@/stores/moveQueueStore";
import { FileText, Image as ImageIcon, Video, Music, FileQuestion, ChevronLeft, ChevronRight, FolderOpen, Maximize2, Minimize2, ListPlus, ListMinus, FolderInput, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useCallback } from "react";
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

export const PreviewModal = () => {
    const target = usePreviewStore((state) => state.target);
    const isOpen = usePreviewStore((state) => state.isOpen);
    const closePreview = usePreviewStore((state) => state.closePreview);
    const openPreview = usePreviewStore((state) => state.openPreview);
    const rotation = usePreviewStore((state) => state.rotation);
    const setRotation = usePreviewStore((state) => state.setRotation);
    const resetRotation = usePreviewStore((state) => state.resetRotation);

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
            resetRotation();
            openPreview({ ...currentEntries[i], path: currentEntries[i].canonical_path });
        }
    }, [target, currentEntries, openPreview, resetRotation]);

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
            resetRotation();
            openPreview({ ...currentEntries[i], path: currentEntries[i].canonical_path });
        }
    }, [target, currentEntries, openPreview, resetRotation]);

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
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight") {
                handleNext();
            } else if (e.key === "ArrowLeft") {
                handlePrev();
            } else if (e.key === "Delete" || ((e.metaKey || e.ctrlKey) && e.key === "Backspace")) {
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
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, handleNext, handlePrev, handleAddToDeleteQueue, isTheatrical, handleOpenWithApp]);

    if (!target) return null;

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
                            onClick={() => setRotation((rotation + 90) % 360)}
                            title="Rotate 90°"
                        >
                            <RotateCw className="w-4 h-4" />
                        </Button>
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
                    <FilePreviewContent
                        path={target.path}
                        extension={target.extension || ""}
                        name={target.name}
                        section="explorer"
                    />
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
