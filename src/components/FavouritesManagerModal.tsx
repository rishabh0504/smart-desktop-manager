import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFavouritesStore } from "@/stores/favouritesStore";
import { useExplorerStore } from "@/stores/explorerStore";
import { FileEntry } from "@/types/explorer";
import { invoke } from "@tauri-apps/api/core";
import {
    Star,
    FileText,
    Folder,
    X,
    ChevronUp,
    ChevronDown,
    ListX,
    ExternalLink,
    Play
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { FilePreviewContent } from "./FilePreviewContent";

// ─── Constants ────────────────────────────────────────────────────────────────

const SELECTED_PATH_KEY = "favourites_selectedPath";

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
    }
}


// ─── Props ────────────────────────────────────────────────────────────────────

interface FavouritesManagerModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const FavouritesManagerModal = ({ open, onOpenChange }: FavouritesManagerModalProps) => {
    const { items: queue, removeFromQueue, clearQueue } = useFavouritesStore();
    const addTab = useExplorerStore((s) => s.addTab);

    // ── Selection ─────────────────────────────────────────────────────────
    const [selected, setSelectedState] = useState<FileEntry | null>(null);

    const setSelected = useCallback((entry: FileEntry | null) => {
        setSelectedState(entry);
        persistSelectedPath(entry?.path ?? null);
    }, []);

    // ── UI state ──────────────────────────────────────────────────────────
    const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());

    const listRef = useRef<HTMLUListElement>(null);

    // ── Computed ──────────────────────────────────────────────────────────
    const selectedIndex = useMemo(
        () => (selected ? queue.findIndex((e) => e.path === selected.path) : -1),
        [queue, selected]
    );

    const selectedExt = selected
        ? (selected.extension ?? selected.name.split(".").pop() ?? "").toLowerCase()
        : "";

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

    // ── Actions ──────────────────────────────────────────────────────────
    const handleOpenItem = useCallback((entry: FileEntry) => {
        if (entry.is_dir) {
            addTab(entry.path);
            onOpenChange(false);
        } else {
            invoke("open_item", { path: entry.path });
        }
    }, [addTab, onOpenChange]);

    const handleRevealItem = useCallback((path: string) => {
        invoke("show_in_finder", { path });
    }, []);

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

    const handleBulkRemove = useCallback(() => {
        if (bulkSelected.size === 0) return;
        const paths = Array.from(bulkSelected);
        paths.forEach((p) => removeFromQueue(p));
        setBulkSelected(new Set());
        toast.success(`Removed ${paths.length} item(s) from favourites`);
    }, [bulkSelected, removeFromQueue]);

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[900px] w-[95vw] h-[88vh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl border border-border/60">

                {/* Header */}
                <DialogHeader className="px-5 py-3.5 border-b shrink-0 bg-gradient-to-r from-primary/8 via-background to-background">
                    <DialogTitle className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/12 ring-1 ring-primary/20 shrink-0">
                            <Star className="w-4 h-4 text-primary fill-primary/20" />
                        </div>
                        <span className="font-semibold text-base">Favourites Manager</span>
                        <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums transition-colors",
                            queue.length > 0
                                ? "bg-primary/12 text-primary"
                                : "bg-muted text-muted-foreground"
                        )}>
                            {queue.length} item{queue.length !== 1 ? "s" : ""}
                        </span>
                        {bulkSelected.size > 0 && (
                            <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/12 text-amber-600 animate-in fade-in">
                                {bulkSelected.size} selected
                            </span>
                        )}
                    </DialogTitle>
                </DialogHeader>

                {/* Body */}
                <div className="flex-1 flex min-h-0">

                    {/* ── Left: file list ──────────────────────────────── */}
                    <div className="w-72 shrink-0 flex flex-col border-r bg-muted/5">
                        <div className="px-3 py-2 border-b flex items-center justify-between bg-muted/10">
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    checked={bulkSelected.size === queue.length && queue.length > 0}
                                    onCheckedChange={toggleAll}
                                    className="h-3.5 w-3.5"
                                />
                                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                                    Favourited items
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

                        <ScrollArea className="flex-1">
                            {queue.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
                                    <div className="w-14 h-14 rounded-full bg-muted/30 flex items-center justify-center">
                                        <Star className="w-7 h-7 text-muted-foreground/40" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">No favourites yet</p>
                                        <p className="text-xs text-muted-foreground/60 mt-0.5">Right-click any file to add it here</p>
                                    </div>
                                </div>
                            ) : (
                                <ul ref={listRef} className="p-2 space-y-0.5">
                                    {queue.map((entry) => {
                                        const isSelected = selected?.path === entry.path;
                                        const isBulked = bulkSelected.has(entry.path);
                                        const ext = (entry.extension ?? entry.name.split(".").pop() ?? "").toUpperCase();
                                        return (
                                            <li
                                                key={entry.path}
                                                className={cn(
                                                    "group flex items-center gap-2 rounded-lg px-2 py-2 text-sm cursor-pointer transition-all duration-150",
                                                    isSelected
                                                        ? "bg-primary/10 ring-1 ring-primary/30 shadow-sm"
                                                        : isBulked
                                                            ? "bg-amber-500/8 ring-1 ring-amber-500/20"
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
                                                {entry.is_dir
                                                    ? <Folder className="w-4 h-4 shrink-0 text-blue-400" />
                                                    : <FileText className={cn("w-4 h-4 shrink-0", isSelected ? "text-primary/70" : "text-muted-foreground")} />
                                                }
                                                <div className="flex-1 min-w-0">
                                                    <p className="truncate text-[13px] font-medium leading-tight" title={entry.name}>
                                                        {entry.name}
                                                    </p>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        {ext && (
                                                            <span className={cn(
                                                                "inline-block px-1 py-px rounded text-[9px] font-bold uppercase tracking-wide",
                                                                isSelected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                                                            )}>
                                                                {ext}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                                                    onClick={(e) => { e.stopPropagation(); removeFromQueue(entry.path); }}
                                                    title="Remove from favourites"
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
                    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-gradient-to-b from-background to-muted/10">
                        {!selected ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground bg-gradient-to-b from-muted/5 to-muted/15 px-8">
                                <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center">
                                    <Star className="w-8 h-8 opacity-40" />
                                </div>
                                <div className="text-center">
                                    <p className="font-medium text-sm">Select a favourite to preview</p>
                                    <p className="text-xs opacity-60 mt-0.5">Click an item to see details</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="px-4 py-2.5 border-b bg-muted/15 shrink-0 flex items-center gap-2">
                                    <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                                    <span className="text-sm font-semibold truncate flex-1 min-w-0" title={selected.path}>
                                        {selected.name}
                                    </span>
                                </div>

                                <div className="flex-1 flex items-center justify-center overflow-hidden min-h-0">
                                    <FilePreviewContent
                                        path={selected.path}
                                        extension={selectedExt}
                                        name={selected.name}
                                        is_dir={selected.is_dir}
                                        section="explorer"
                                    />
                                </div>

                                <div className="px-4 py-3 border-t bg-muted/10 flex items-center gap-3 shrink-0">
                                    <div className="flex-1 min-w-0 text-[10px] text-muted-foreground">
                                        <p className="font-mono truncate opacity-60" title={selected.path}>{selected.path}</p>
                                        <p className="mt-0.5 uppercase font-bold tracking-wider">{selected.is_dir ? "Folder" : selectedExt || "File"}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 gap-1.5 text-xs font-bold"
                                            onClick={() => handleRevealItem(selected.path)}
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            Reveal
                                        </Button>
                                        <Button
                                            variant="default"
                                            size="sm"
                                            className="h-8 gap-1.5 text-xs font-bold"
                                            onClick={() => handleOpenItem(selected)}
                                        >
                                            <Play className="w-3.5 h-3.5" />
                                            {selected.is_dir ? "Go to folder" : "Open file"}
                                        </Button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Footer action bar */}
                <div className="px-5 py-3 border-t shrink-0 bg-muted/5 flex items-center justify-between gap-3">
                    <div className="flex-1 flex items-center gap-2">
                        {bulkSelected.size > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5 text-xs font-semibold border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                                onClick={handleBulkRemove}
                            >
                                <ListX className="w-3.5 h-3.5" />
                                Remove {bulkSelected.size} from favourites
                            </Button>
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs font-semibold text-muted-foreground"
                        disabled={queue.length === 0}
                        onClick={clearQueue}
                    >
                        Clear All
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
