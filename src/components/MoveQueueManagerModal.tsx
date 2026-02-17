import { useState, useMemo, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMoveQueueStore } from "@/stores/moveQueueStore";
import type { FileEntry } from "@/types/explorer";
import { useExplorerStore } from "@/stores/explorerStore";
import { invoke } from "@tauri-apps/api/core";
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
    FileQuestion,
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

interface MoveQueueManagerModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type SelectedFile = { queueId: string; path: string };

function VideoPreviewMuted({ src, className }: { src: string; className?: string }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        el.muted = true;
        const onPlay = () => { el.muted = true; };
        el.addEventListener("play", onPlay);
        return () => el.removeEventListener("play", onPlay);
    }, [src]);
    return <video ref={videoRef} controls src={src} className={className} muted playsInline />;
}

export const MoveQueueManagerModal = ({ open: isOpen, onOpenChange }: MoveQueueManagerModalProps) => {
    const { queues, updateQueue, removeQueue, clearQueue, moveItemToQueue } = useMoveQueueStore();
    const refresh = useExplorerStore((s) => s.refresh);
    const tabs = useExplorerStore((s) => s.tabs);

    const [movingQueueId, setMovingQueueId] = useState<string | null>(null);
    const [expandedQueues, setExpandedQueues] = useState<Set<string>>(new Set());
    const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
    const [moveToQueueId, setMoveToQueueId] = useState<string>("");
    const [previewContent, setPreviewContent] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

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

    useEffect(() => {
        if (!selectedEntry || !isOpen) {
            setPreviewContent(null);
            setPreviewError(null);
            return;
        }
        const ext = (selectedEntry.extension ?? "").toLowerCase();
        const isText = ["txt", "md", "js", "ts", "json", "rs", "css", "html", "py", "sh", "yml", "yaml"].includes(ext);
        const isPdf = ext === "pdf";
        const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);
        const isVideo = ["mp4", "webm", "ogg", "mov"].includes(ext);
        const isAudio = ["mp3", "wav", "ogg", "flac"].includes(ext);

        setPreviewLoading(true);
        setPreviewError(null);
        if (isText) {
            invoke<string>("get_file_text_content", { path: selectedEntry.path })
                .then((c) => { setPreviewContent(c); setPreviewError(null); })
                .catch((e) => { setPreviewError(String(e)); setPreviewContent(null); })
                .finally(() => setPreviewLoading(false));
        } else if (isPdf) {
            invoke<string>("get_file_base64_content", { path: selectedEntry.path })
                .then((c) => { setPreviewContent(c); setPreviewError(null); })
                .catch((e) => { setPreviewError(String(e)); setPreviewContent(null); })
                .finally(() => setPreviewLoading(false));
        } else if (isImage || isVideo || isAudio) {
            setPreviewContent(`vmedia://localhost/${encodeURIComponent(selectedEntry.path)}`);
            setPreviewLoading(false);
        } else {
            setPreviewLoading(false);
        }
    }, [selectedEntry?.path, isOpen]);

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

    const handleMoveAll = async (queueId: string) => {
        const queue = useMoveQueueStore.getState().getQueue(queueId);
        if (!queue || queue.items.length === 0) return;
        setMovingQueueId(queueId);
        try {
            const operationId = crypto.randomUUID();
            await invoke("batch_move", {
                operationId,
                sources: queue.items.map((e) => e.path),
                destinationDir: queue.folderPath,
            });
            clearQueue(queueId);
            tabs.forEach((tab) => {
                if (tab.type === "explorer") refresh(tab.id);
            });
            toast.success(`Moved ${queue.items.length} item(s) to ${queue.folderPath}`);
        } catch (e) {
            toast.error(`Move failed: ${e}`);
        } finally {
            setMovingQueueId(null);
        }
    };

    const handleMoveItemToQueue = () => {
        if (!selectedFile || !moveToQueueId) return;
        moveItemToQueue(selectedFile.queueId, moveToQueueId, selectedFile.path);
        toast.success("Item moved to other queue");
        setMoveToQueueId("");
        setSelectedFile(null);
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
                                                            disabled={q.items.length === 0 || movingQueueId !== null}
                                                            onClick={() => handleMoveAll(q.id)}
                                                        >
                                                            {movingQueueId === q.id ? (
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
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

                        {/* Right: preview + move to queue */}
                        <div className="flex flex-col min-w-0 bg-muted/20">
                            <div className="px-4 py-2 border-b text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                Preview & move to queue
                            </div>
                            <ScrollArea className="flex-1">
                                <div className="p-4 space-y-4">
                                    {!selectedEntry ? (
                                        <p className="text-sm text-muted-foreground">
                                            Select a file from the tree on the left to see preview and move it to another queue.
                                        </p>
                                    ) : (
                                        <>
                                            <section>
                                                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
                                                    Content preview
                                                </p>
                                                <div className="rounded-lg border bg-background overflow-hidden min-h-[200px] flex items-center justify-center">
                                                    {(() => {
                                                        const ext = (selectedEntry.extension ?? "").toLowerCase();
                                                        const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);
                                                        const isVideo = ["mp4", "webm", "ogg", "mov"].includes(ext);
                                                        const isAudio = ["mp3", "wav", "ogg", "flac"].includes(ext);
                                                        const isText = ["txt", "md", "js", "ts", "json", "rs", "css", "html", "py", "sh", "yml", "yaml"].includes(ext);
                                                        const isPdf = ext === "pdf";
                                                        const mediaSrc = previewContent && (isImage || isVideo || isAudio) ? previewContent : null;
                                                        if (previewLoading) {
                                                            return (
                                                                <div className="flex items-center gap-2 text-muted-foreground py-8">
                                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                                    <span>Loading…</span>
                                                                </div>
                                                            );
                                                        }
                                                        if (previewError) {
                                                            return <p className="text-sm text-muted-foreground p-4 text-center">{previewError}</p>;
                                                        }
                                                        if (isImage && mediaSrc) {
                                                            return <img src={mediaSrc} alt={selectedEntry.name} className="max-w-full max-h-[320px] object-contain" />;
                                                        }
                                                        if (isVideo && mediaSrc) {
                                                            return <VideoPreviewMuted src={mediaSrc} className="max-w-full max-h-[320px] object-contain rounded" />;
                                                        }
                                                        if (isAudio && mediaSrc) {
                                                            return (
                                                                <div className="p-6 w-full max-w-sm">
                                                                    <audio controls src={mediaSrc} className="w-full" muted />
                                                                </div>
                                                            );
                                                        }
                                                        if (isText && previewContent) {
                                                            return (
                                                                <div className="w-full h-full max-h-[320px] p-4 font-mono text-xs bg-muted/20 overflow-auto whitespace-pre text-left">
                                                                    {previewContent}
                                                                </div>
                                                            );
                                                        }
                                                        if (isPdf && previewContent) {
                                                            return (
                                                                <embed
                                                                    src={previewContent}
                                                                    type="application/pdf"
                                                                    className="w-full min-h-[320px] rounded"
                                                                />
                                                            );
                                                        }
                                                        return (
                                                            <div className="flex flex-col items-center gap-2 text-muted-foreground p-6">
                                                                <FileQuestion className="w-12 h-12 opacity-50" />
                                                                <p className="text-sm">No preview for this file type</p>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </section>

                                            {selectedQueue && (
                                                <section className="flex gap-4 text-xs">
                                                    <div>
                                                        <span className="text-muted-foreground">Queue</span>
                                                        <p className="font-medium truncate" title={selectedQueue.name}>{selectedQueue.name}</p>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <span className="text-muted-foreground">Destination</span>
                                                        <p className="truncate text-muted-foreground" title={selectedQueue.folderPath}>{selectedQueue.folderPath}</p>
                                                    </div>
                                                </section>
                                            )}

                                            {otherQueuesForMove.length > 0 && (
                                                <section>
                                                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
                                                        Move to queue
                                                    </p>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <Select value={moveToQueueId || undefined} onValueChange={setMoveToQueueId}>
                                                            <SelectTrigger className="min-w-[180px]">
                                                                <SelectValue placeholder="Select queue…" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {otherQueuesForMove.map((oq) => (
                                                                    <SelectItem key={oq.id} value={oq.id}>
                                                                        {oq.name} → {oq.folderPath}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <Button
                                                            size="sm"
                                                            disabled={!moveToQueueId}
                                                            onClick={handleMoveItemToQueue}
                                                        >
                                                            Move to selected queue
                                                        </Button>
                                                    </div>
                                                </section>
                                            )}
                                        </>
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
