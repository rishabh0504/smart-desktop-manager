import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDeleteQueueStore } from "@/stores/deleteQueueStore";
import { useExplorerStore } from "@/stores/explorerStore";
import { FileEntry } from "@/types/explorer";
import { invoke } from "@tauri-apps/api/core";
import { Trash2, FileText, FileQuestion, Folder, Loader2, X, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function PreviewPane({ entry }: { entry: FileEntry | null }) {
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!entry) {
            setContent(null);
            setError(null);
            return;
        }
        if (entry.is_dir) {
            setContent(null);
            setError("Folder — no preview");
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        const ext = (entry.extension ?? "").toLowerCase();
        const isText = ["txt", "md", "js", "ts", "json", "rs", "css", "html", "py", "sh", "yml", "yaml"].includes(ext);
        const isPdf = ext === "pdf";
        const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);
        const isVideo = ["mp4", "webm", "ogg", "mov"].includes(ext);
        const isAudio = ["mp3", "wav", "ogg", "flac"].includes(ext);

        if (isText) {
            invoke<string>("get_file_text_content", { path: entry.path })
                .then(setContent)
                .catch((e: unknown) => setError(String(e)))
                .finally(() => setLoading(false));
        } else if (isPdf) {
            invoke<string>("get_file_base64_content", { path: entry.path })
                .then(setContent)
                .catch((e: unknown) => setError(String(e)))
                .finally(() => setLoading(false));
        } else if (isImage || isVideo || isAudio) {
            setContent(`vmedia://localhost/${encodeURIComponent(entry.path)}`);
            setLoading(false);
        } else {
            setLoading(false);
        }
    }, [entry?.path]);

    if (!entry) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm border-l bg-gradient-to-b from-muted/5 to-muted/15">
                <FileQuestion className="w-14 h-14 mb-3 opacity-30" />
                <p className="font-medium">Select an item to preview</p>
                <p className="text-xs mt-1 opacity-80">Use the list or ↑ ↓ to choose</p>
            </div>
        );
    }

    const ext = (entry.extension ?? "").toLowerCase();
    const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);
    const isVideo = ["mp4", "webm", "ogg", "mov"].includes(ext);
    const isAudio = ["mp3", "wav", "ogg", "flac"].includes(ext);
    const isText = ["txt", "md", "js", "ts", "json", "rs", "css", "html", "py", "sh", "yml", "yaml"].includes(ext);
    const isPdf = ext === "pdf";
    const mediaSrc = content && (isImage || isVideo || isAudio) ? content : null;

    return (
        <div className="flex-1 flex flex-col min-w-0 border-l bg-gradient-to-b from-background to-muted/10">
            <div className="px-4 py-3 border-b bg-muted/20 text-sm font-semibold truncate shadow-sm" title={entry.path}>
                {entry.name}
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center p-6">
                {loading && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Loading...</span>
                    </div>
                )}
                {error && !loading && (
                    <div className="text-center text-sm text-muted-foreground">{error}</div>
                )}
                {isImage && mediaSrc && !loading && (
                    <img src={mediaSrc} alt={entry.name} className="max-w-full max-h-full object-contain rounded-lg shadow-lg ring-1 ring-black/5" />
                )}
                {isVideo && mediaSrc && !loading && (
                    <video controls src={mediaSrc} className="max-w-full max-h-full rounded-lg shadow-lg ring-1 ring-black/5" muted playsInline />
                )}
                {isAudio && mediaSrc && !loading && (
                    <div className="w-full max-w-md rounded-xl bg-muted/30 p-6 shadow-md">
                        <audio controls src={mediaSrc} className="w-full" />
                    </div>
                )}
                {isText && content && !loading && (
                    <div className="w-full h-full font-mono text-xs bg-muted/20 border rounded-xl p-5 overflow-auto whitespace-pre shadow-inner">
                        {content}
                    </div>
                )}
                {isPdf && content && !loading && (
                    <embed src={content} type="application/pdf" className="w-full h-full min-h-[400px] rounded-lg shadow-lg" />
                )}
                {!isImage && !isVideo && !isAudio && !isText && !isPdf && !loading && !error && (
                    <div className="text-center text-muted-foreground text-sm rounded-xl bg-muted/20 p-8 border border-dashed">
                        <FileQuestion className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No preview</p>
                    </div>
                )}
            </div>
        </div>
    );
}

interface DeleteQueueModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const DeleteQueueModal = ({ open, onOpenChange }: DeleteQueueModalProps) => {
    const { queue, removeFromQueue, clearQueue } = useDeleteQueueStore();
    const refresh = useExplorerStore((s) => s.refresh);
    const tabs = useExplorerStore((s) => s.tabs);

    const [selected, setSelected] = useState<FileEntry | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const listRef = useRef<HTMLUListElement>(null);

    useEffect(() => {
        if (!open) {
            setSelected(null);
            setConfirmOpen(false);
        } else if (queue.length > 0) {
            setSelected((prev) => (prev && queue.some((e) => e.path === prev.path) ? prev : queue[0]));
        } else {
            setSelected(null);
        }
    }, [open, queue.length]);

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

    const confirmDelete = useCallback(async () => {
        if (queue.length === 0) return;
        setDeleting(true);
        try {
            const operationId = crypto.randomUUID();
            await invoke("delete_items", { operationId, paths: queue.map((e) => e.path) });
            clearQueue();
            onOpenChange(false);
            setConfirmOpen(false);
            tabs.forEach((tab) => {
                if (tab.type === "explorer") refresh(tab.id);
            });
            toast.success(`${queue.length} item(s) deleted`);
        } catch (e) {
            toast.error(`Delete failed: ${e}`);
        } finally {
            setDeleting(false);
        }
    }, [queue, clearQueue, onOpenChange, tabs, refresh]);

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
                        <div className="w-80 shrink-0 flex flex-col border-r bg-muted/5">
                            <div className="px-3 py-2.5 border-b flex items-center justify-between bg-muted/10">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                                    Queued items
                                </span>
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
                                                    "flex items-center gap-2 rounded-lg p-2.5 text-sm cursor-pointer group transition-colors",
                                                    selected?.path === entry.path
                                                        ? "bg-primary/15 ring-1 ring-primary/40 shadow-sm"
                                                        : "hover:bg-muted/50"
                                                )}
                                                onClick={() => setSelected(entry)}
                                            >
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
                        <PreviewPane entry={selected} />
                    </div>

                    <div className="px-6 py-4 border-t flex justify-between items-center shrink-0 bg-muted/5">
                        <span className="text-xs text-muted-foreground">
                            ↑ ↓ to move selection • Click to preview before deleting
                        </span>
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
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Deleting...
                                </>
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
