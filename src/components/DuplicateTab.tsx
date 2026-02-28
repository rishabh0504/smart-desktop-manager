import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDedupeStore } from "@/stores/dedupeStore";
import { Button } from "@/components/ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import {
    Search, Trash2, RefreshCcw, FileText, ChevronRight, Square, CheckSquare,
    CopyCheck, Loader2, Clock, FolderPlus, FolderOpen, ListPlus as ListPlusIcon,
    ListMinus as ListMinusIcon, FolderInput as FolderInputIcon, X, CheckCheck, Filter
} from "lucide-react";
import { cn } from "@/lib/utils";
import { open } from "@tauri-apps/plugin-dialog";
import { useDeleteQueueStore } from "@/stores/deleteQueueStore";
import { useMoveQueueStore } from "@/stores/moveQueueStore";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilePreviewContent } from "./FilePreviewContent";

interface DuplicateTabProps {
    tabId: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatSize(bytes: number) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes; let ui = 0;
    while (size >= 1024 && ui < units.length - 1) { size /= 1024; ui++; }
    return `${size.toFixed(ui === 0 ? 0 : 1)} ${units[ui]}`;
}

function formatDuration(ms: number) {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function getFileName(path: string) { return path.split(/[/\\]/).pop() || path; }
function getParentDir(path: string) {
    const parts = path.split(/[/\\]/);
    return parts.length > 1 ? parts[parts.length - 2] : "";
}

// ── Component ─────────────────────────────────────────────────────────────────

export const DuplicateTab = ({ tabId: _tabId }: DuplicateTabProps) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    const scanning = useDedupeStore((s) => s.scanning);
    const progress = useDedupeStore((s) => s.progress);
    const duplicates = useDedupeStore((s) => s.duplicates);
    const selectedPaths = useDedupeStore((s) => s.selectedPaths);
    const scanQueue = useDedupeStore((s) => s.scanQueue);
    const expandedGroups = useDedupeStore((s) => s.expandedGroups);
    const previewTarget = useDedupeStore((s) => s.previewTarget);
    const startScan = useDedupeStore((s) => s.startScan);
    const resetScan = useDedupeStore((s) => s.resetScan);
    const removeFromQueue = useDedupeStore((s) => s.removeFromQueue);
    const toggleSelection = useDedupeStore((s) => s.toggleSelection);
    const toggleGroup = useDedupeStore((s) => s.toggleGroup);
    const setPreviewTarget = useDedupeStore((s) => s.setPreviewTarget);
    const selectDuplicates = useDedupeStore((s) => s.selectDuplicates);
    const deleteSelected = useDedupeStore((s) => s.deleteSelected);
    const sameFolderOnly = useDedupeStore((s) => s.sameFolderOnly);
    const setSameFolderOnly = useDedupeStore((s) => s.setSameFolderOnly);

    const deleteQueue = useDeleteQueueStore((s) => s.queue);
    const addToDeleteQueue = useDeleteQueueStore((s) => s.addToQueue);
    const removeFromDeleteQueue = useDeleteQueueStore((s) => s.removeFromQueue);

    const moveQueues = useMoveQueueStore((s) => s.queues);
    const addToMoveQueue = useMoveQueueStore((s) => s.addToQueue);
    const removeFromMoveQueue = useMoveQueueStore((s) => s.removeFromQueue);
    const findQueuesContainingPath = useMoveQueueStore((s) => s.findQueuesContainingPath);

    const [selectedMoveQueueId, setSelectedMoveQueueId] = useState<string>("");
    const [filterQuery, setFilterQuery] = useState("");

    // ── Derived data ─────────────────────────────────────────────────────────

    const sameFolderFiltered = useMemo(() => {
        if (!sameFolderOnly) return duplicates;
        return duplicates.map(g => {
            const parentGroups: Record<string, string[]> = {};
            g.paths.forEach(p => {
                const parent = p.substring(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')));
                if (!parentGroups[parent]) parentGroups[parent] = [];
                parentGroups[parent].push(p);
            });
            const filteredPaths = Object.values(parentGroups).filter(pl => pl.length > 1).flat();
            return { ...g, paths: filteredPaths };
        }).filter(g => g.paths.length > 1);
    }, [duplicates, sameFolderOnly]);

    const filteredDuplicates = useMemo(() => {
        if (!filterQuery.trim()) return sameFolderFiltered;
        const q = filterQuery.toLowerCase();
        return sameFolderFiltered.filter(g => g.paths.some(p => getFileName(p).toLowerCase().includes(q)));
    }, [sameFolderFiltered, filterQuery]);

    // Wasted space = (copies - 1) * size for each group
    const wastedBytes = useMemo(() =>
        filteredDuplicates.reduce((sum, g) => sum + g.size * (g.paths.length - 1), 0),
        [filteredDuplicates]
    );

    useEffect(() => {
        if (moveQueues.length === 0) setSelectedMoveQueueId("");
        else if (!selectedMoveQueueId || !moveQueues.some(q => q.id === selectedMoveQueueId))
            setSelectedMoveQueueId(moveQueues[0].id);
    }, [moveQueues, selectedMoveQueueId]);

    // ── Queue handlers ───────────────────────────────────────────────────────

    const makeFileEntry = (path: string) => ({
        path, name: getFileName(path),
        extension: path.split('.').pop() || "",
        size: 0, canonical_path: path, is_dir: false, modified: 0
    });

    const handleAddToDeleteQueue = useCallback((path: string) => {
        addToDeleteQueue(makeFileEntry(path));
        toast.success(`Added "${getFileName(path)}" to delete queue`);
    }, [addToDeleteQueue]);

    const handleRemoveFromDeleteQueue = useCallback((path: string) => {
        removeFromDeleteQueue(path);
        toast.success("Removed from delete queue");
    }, [removeFromDeleteQueue]);

    const handleAddToMoveQueue = useCallback((path: string) => {
        if (!selectedMoveQueueId) return;
        addToMoveQueue(selectedMoveQueueId, makeFileEntry(path));
        toast.success(`Added "${getFileName(path)}" to move queue`);
    }, [selectedMoveQueueId, addToMoveQueue]);

    const handleRemoveFromMoveQueue = useCallback((path: string) => {
        findQueuesContainingPath(path).forEach(qId => removeFromMoveQueue(qId, path));
        toast.success("Removed from move queue(s)");
    }, [findQueuesContainingPath, removeFromMoveQueue]);

    const bulkAddToDeleteQueue = useCallback(() => {
        if (selectedPaths.size === 0) return;
        selectedPaths.forEach(p => addToDeleteQueue(makeFileEntry(p)));
        toast.success(`Added ${selectedPaths.size} files to delete queue`);
    }, [selectedPaths, addToDeleteQueue]);

    const bulkAddToMoveQueue = useCallback(() => {
        if (selectedPaths.size === 0 || !selectedMoveQueueId) return;
        selectedPaths.forEach(p => addToMoveQueue(selectedMoveQueueId, makeFileEntry(p)));
        toast.success(`Added ${selectedPaths.size} files to move queue`);
    }, [selectedPaths, selectedMoveQueueId, addToMoveQueue]);

    // ── Virtualizer ──────────────────────────────────────────────────────────

    const virtualizer = useVirtualizer({
        count: filteredDuplicates.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: (i) => {
            const g = filteredDuplicates[i];
            if (g && expandedGroups.has(String(g.hash))) return 44 + g.paths.length * 32 + 8;
            return 52;
        },
        overscan: 10,
    });

    useEffect(() => { virtualizer.measure(); }, [filteredDuplicates, expandedGroups, previewTarget, virtualizer]);

    // ── Phase label for progress UI ────────────────────────────────────────
    const phaseLabel = useMemo(() => {
        if (!progress) return "";
        switch (progress.phase) {
            case 0: return "Discovering files…";
            case 1: return "Partial hash (quick check)";
            case 2: return "Deep verification";
            case 3: return "Done";
            default: return progress.status;
        }
    }, [progress]);

    return (
        <div className="flex h-full bg-background border rounded-xl overflow-hidden transition-colors shadow-sm">
            {/* ── Main list column ─────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col min-w-0 border-r overflow-hidden">
                {/* Header */}
                <div className={cn(
                    "shrink-0 px-4 pt-4 pb-3 border-b flex flex-col gap-3",
                    "bg-gradient-to-br from-muted/60 via-muted/30 to-background"
                )}>
                    {/* Title row */}
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 bg-primary/10 text-primary rounded-xl shrink-0">
                                <CopyCheck className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-sm font-bold tracking-tight text-foreground leading-none mb-0.5">Duplicate Finder</h2>
                                <p className="text-[11px] text-muted-foreground leading-none">Find and remove identical files to free up space</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                            {duplicates.length > 0 && !scanning && (
                                <>
                                    {/* Time taken chip */}
                                    {progress && (
                                        <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/50 border text-[10px] font-semibold text-muted-foreground">
                                            <Clock className="w-3 h-3" />
                                            {formatDuration(progress.elapsed_ms)}
                                        </div>
                                    )}
                                    {/* Wasted space chip */}
                                    {wastedBytes > 0 && (
                                        <div className="hidden md:flex items-center gap-1 px-2 py-1 rounded-lg bg-destructive/10 border border-destructive/20 text-[10px] font-semibold text-destructive">
                                            {formatSize(wastedBytes)} wasted
                                        </div>
                                    )}
                                    <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px] gap-1" onClick={() => startScan()} title="Re-run scan">
                                        <RefreshCcw className="w-3 h-3" /> Refresh
                                    </Button>
                                    <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px] gap-1" onClick={() => resetScan()}>
                                        <Search className="w-3 h-3" /> New Scan
                                    </Button>
                                </>
                            )}
                            <Button
                                disabled={scanning || scanQueue.length === 0}
                                size="sm"
                                className="h-7 px-3 text-[11px] font-semibold bg-primary text-primary-foreground gap-1.5 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm"
                                onClick={() => startScan()}
                            >
                                {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                                {scanning ? "Scanning…" : "Scan"}
                            </Button>
                        </div>
                    </div>

                    {/* Stats row — only when results exist */}
                    {!scanning && filteredDuplicates.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="px-2.5 py-1 rounded-lg bg-muted/50 border text-[10px] font-semibold text-muted-foreground tabular-nums">
                                {filteredDuplicates.length} groups
                            </div>
                            <div className="px-2.5 py-1 rounded-lg bg-muted/50 border text-[10px] font-semibold text-muted-foreground tabular-nums">
                                {filteredDuplicates.reduce((s, g) => s + g.paths.length, 0)} files
                            </div>
                            {wastedBytes > 0 && (
                                <div className="px-2.5 py-1 rounded-lg bg-destructive/10 border border-destructive/20 text-[10px] font-semibold text-destructive tabular-nums sm:hidden">
                                    {formatSize(wastedBytes)} wasted
                                </div>
                            )}
                        </div>
                    )}

                    {/* Folder queue strip */}
                    <div className="flex items-center gap-2 bg-background/70 border rounded-lg p-1.5 shadow-xs">
                        <div className="flex items-center gap-1.5 px-1.5 text-muted-foreground shrink-0">
                            <FolderPlus className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Folders</span>
                        </div>
                        <div className="w-px h-4 bg-border shrink-0" />
                        <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0 overflow-hidden">
                            {scanQueue.length === 0
                                ? <span className="text-[11px] text-destructive/70 font-medium animate-pulse">None selected — add a folder to scan</span>
                                : scanQueue.map(path => (
                                    <div key={path} className="group flex items-center gap-1 bg-muted border px-2 py-0.5 rounded-md text-[10px] font-medium hover:border-primary/50 transition-all max-w-[180px]" title={path}>
                                        <FolderOpen className="w-3 h-3 text-sky-500 shrink-0" />
                                        <span className="truncate">{getFileName(path) || path}</span>
                                        <button className="opacity-0 group-hover:opacity-100 ml-0.5 shrink-0 text-muted-foreground hover:text-destructive transition-all"
                                            onClick={() => removeFromQueue(path)}>
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                        </div>
                        <Button
                            variant="ghost" size="sm"
                            className="h-6 px-2 text-[10px] gap-1 text-primary hover:bg-primary/10 shrink-0"
                            onClick={() => {
                                open({ directory: true, multiple: true, title: "Select Folders to Scan" }).then(selected => {
                                    if (!selected) return;
                                    const items = Array.isArray(selected) ? selected : [selected];
                                    items.forEach(item => {
                                        const p = typeof item === "string" ? item : (item as any).path || String(item);
                                        if (p) useDedupeStore.getState().addToQueue(p);
                                    });
                                }).catch(console.error);
                            }}
                        >
                            <FolderPlus className="w-3 h-3" /> Add
                        </Button>
                    </div>

                    {/* Same-folder filter toggle */}
                    {duplicates.length > 0 && (
                        <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground cursor-pointer hover:text-foreground w-fit select-none">
                            <Checkbox
                                checked={sameFolderOnly}
                                onCheckedChange={(v) => setSameFolderOnly(v as boolean)}
                                className="w-3.5 h-3.5"
                            />
                            Same folder only
                        </label>
                    )}
                </div>

                {/* ── Scan progress ─────────────────────────────────────────── */}
                {scanning && progress && (
                    <div className="shrink-0 px-4 py-3 border-b bg-primary/5 space-y-2.5">
                        {/* Phase steps */}
                        <div className="flex items-center gap-1 mb-1">
                            {(["Discover", "Partial hash", "Verify"] as const).map((label, i) => (
                                <div key={label} className="flex items-center gap-1">
                                    <div className={cn(
                                        "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold transition-colors",
                                        progress.phase === i ? "bg-primary text-primary-foreground" :
                                            progress.phase > i ? "bg-primary/20 text-primary" :
                                                "bg-muted text-muted-foreground/40"
                                    )}>
                                        <span>{i + 1}</span>
                                        <span>{label}</span>
                                    </div>
                                    {i < 2 && <div className={cn("w-4 h-px", progress.phase > i ? "bg-primary/40" : "bg-border")} />}
                                </div>
                            ))}
                        </div>

                        {/* Status + count */}
                        <div className="flex justify-between items-end">
                            <div className="min-w-0">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-primary">{phaseLabel}</div>
                                {progress.phase === 0 && (
                                    <div className="text-xs text-muted-foreground mt-0.5">{progress.scanned.toLocaleString()} files found…</div>
                                )}
                                {(progress.phase === 1 || progress.phase === 2) && progress.total_files > 0 && (
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                        {Math.min(progress.scanned, progress.total_files).toLocaleString()} / {progress.total_files.toLocaleString()} files
                                    </div>
                                )}
                            </div>
                            <div className="text-right shrink-0 ml-4">
                                <div className="text-2xl font-bold tabular-nums text-primary">{progress.percent}%</div>
                                <div className="flex items-center gap-1 justify-end text-[10px] text-muted-foreground/60">
                                    <Clock className="w-3 h-3" />
                                    {formatDuration(progress.elapsed_ms)}
                                </div>
                            </div>
                        </div>

                        {/* Accurate progress bar */}
                        <div className="relative h-2 w-full bg-muted rounded-full overflow-hidden">
                            {progress.phase === 0 ? (
                                // Discovery: indeterminate shimmer
                                <div className="absolute inset-0 overflow-hidden rounded-full">
                                    <div className="h-full w-1/3 bg-gradient-to-r from-primary/0 via-primary to-primary/0 animate-[shimmer_1.4s_ease-in-out_infinite]"
                                        style={{ animation: "shimmer 1.4s ease-in-out infinite", backgroundSize: "200% 100%" }}
                                    />
                                    <style>{`@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }`}</style>
                                </div>
                            ) : (
                                <div
                                    className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-300"
                                    style={{ width: `${progress.percent}%` }}
                                />
                            )}
                        </div>

                        <div className="flex justify-between text-[10px] text-muted-foreground/60 font-medium">
                            <span>{duplicates.length} duplicate groups found so far</span>
                            <span className="tabular-nums">{progress.scanned.toLocaleString()} scanned</span>
                        </div>
                    </div>
                )}

                {/* ── Results list ──────────────────────────────────────────── */}
                {!scanning && duplicates.length > 0 && (
                    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                        {/* Toolbar */}
                        <div className="shrink-0 px-3 py-2 border-b bg-muted/20 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm"
                                    className={cn("h-7 px-2 text-[11px] gap-1.5 hover:bg-primary/10 hover:text-primary")}
                                    onClick={() => selectedPaths.size > 0 ? selectDuplicates("none") : selectDuplicates("all-but-newest", filteredDuplicates)}
                                >
                                    {selectedPaths.size > 0
                                        ? <><CheckSquare className="w-3.5 h-3.5" />Deselect All</>
                                        : <><Square className="w-3.5 h-3.5" />Select Dupes</>
                                    }
                                </Button>
                                {duplicates.length > 0 && (
                                    <Button variant="ghost" size="sm"
                                        className="h-7 px-2 text-[11px] gap-1.5 hover:bg-primary/10 hover:text-primary"
                                        onClick={() => selectDuplicates("all-but-newest", filteredDuplicates)}
                                        title="Keep the newest file in each group, select the rest"
                                    >
                                        <CheckCheck className="w-3.5 h-3.5" />Keep Newest
                                    </Button>
                                )}
                            </div>

                            {/* Filter input */}
                            <div className="relative flex-1 min-w-[120px] max-w-[220px]">
                                <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                                <Input
                                    value={filterQuery}
                                    onChange={e => setFilterQuery(e.target.value)}
                                    placeholder="Filter by name…"
                                    className="h-7 pl-6 text-[11px] bg-background"
                                />
                                {filterQuery && (
                                    <button className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        onClick={() => setFilterQuery("")}>
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] font-bold text-muted-foreground tabular-nums">{selectedPaths.size} selected</span>
                                <div className="h-4 w-px bg-border" />
                                <Button variant="outline" size="sm" className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10"
                                    disabled={selectedPaths.size === 0} onClick={bulkAddToDeleteQueue}>
                                    <ListPlusIcon className="w-3.5 h-3.5 mr-1" /> Queue Delete
                                </Button>
                                {moveQueues.length > 0 && (
                                    <>
                                        <Select value={selectedMoveQueueId} onValueChange={setSelectedMoveQueueId}>
                                            <SelectTrigger className="h-7 w-[110px] text-[11px]">
                                                <SelectValue placeholder="Move Queue" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {moveQueues.map(q => (
                                                    <SelectItem key={q.id} value={q.id}>{q.name} ({q.items.length})</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Button variant="outline" size="sm" className="h-7 px-2 text-[11px] text-primary hover:bg-primary/10"
                                            disabled={selectedPaths.size === 0 || !selectedMoveQueueId} onClick={bulkAddToMoveQueue}>
                                            <FolderInputIcon className="w-3.5 h-3.5 mr-1" /> Queue Move
                                        </Button>
                                    </>
                                )}
                                <div className="h-4 w-px bg-border" />
                                <Button variant="destructive" size="sm"
                                    className="h-7 px-2 text-[11px] font-semibold shadow-sm shadow-destructive/20"
                                    disabled={selectedPaths.size === 0} onClick={deleteSelected}>
                                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                                </Button>
                            </div>
                        </div>

                        {/* Virtualized list */}
                        <div ref={scrollRef} className="flex-1 overflow-auto min-h-0">
                            {filteredDuplicates.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground opacity-60">
                                    <Search className="w-8 h-8 opacity-50" />
                                    <p className="text-sm font-medium">No groups match "{filterQuery}"</p>
                                </div>
                            )}
                            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                                {virtualizer.getVirtualItems().map(virtualRow => {
                                    const group = filteredDuplicates[virtualRow.index];
                                    if (!group) return null;
                                    const isExpanded = expandedGroups.has(String(group.hash));
                                    const groupSelectedCount = group.paths.filter(p => selectedPaths.has(p)).length;

                                    return (
                                        <div
                                            key={String(group.hash)}
                                            data-index={virtualRow.index}
                                            ref={virtualizer.measureElement}
                                            className="absolute top-0 left-0 w-full px-3 py-1"
                                            style={{ transform: `translateY(${virtualRow.start}px)` }}
                                        >
                                            <div className="border rounded-lg overflow-hidden bg-card shadow-xs hover:shadow-sm transition-shadow">
                                                {/* Group header */}
                                                <div
                                                    className={cn(
                                                        "flex items-center justify-between px-3 py-2 cursor-pointer select-none transition-colors",
                                                        "border-l-4",
                                                        groupSelectedCount > 0 ? "border-l-destructive bg-destructive/3 hover:bg-destructive/5" : "border-l-primary/20 bg-muted/20 hover:bg-muted/40"
                                                    )}
                                                    onClick={() => toggleGroup(String(group.hash))}
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0", isExpanded && "rotate-90")} />
                                                        {/* Select all in group checkbox */}
                                                        <Checkbox
                                                            checked={groupSelectedCount === group.paths.length && group.paths.length > 0}
                                                            onCheckedChange={(checked) => {
                                                                group.paths.forEach(p => {
                                                                    const inSelection = selectedPaths.has(p);
                                                                    if (checked && !inSelection) toggleSelection(p);
                                                                    if (!checked && inSelection) toggleSelection(p);
                                                                });
                                                            }}
                                                            onClick={e => e.stopPropagation()}
                                                            className="w-3.5 h-3.5 data-[state=checked]:bg-destructive data-[state=checked]:border-destructive shrink-0"
                                                        />
                                                        <div className="p-1 bg-background border rounded-md shadow-xs shrink-0">
                                                            <FileText className="w-3 h-3 text-primary" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="text-[12px] font-semibold truncate leading-tight text-foreground">
                                                                {getFileName(group.paths[0])}
                                                            </div>
                                                            <div className="text-[9px] text-muted-foreground/60 font-bold uppercase tracking-wider mt-0.5">
                                                                {formatSize(group.size)} each
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {groupSelectedCount > 0 && (
                                                            <span className="px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive text-[9px] font-bold tabular-nums">
                                                                {groupSelectedCount} queued
                                                            </span>
                                                        )}
                                                        <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold tabular-nums">
                                                            {group.paths.length} copies
                                                        </span>
                                                        <span className="text-[9px] font-mono text-muted-foreground/30 hidden lg:inline">
                                                            {String(group.hash).slice(0, 8)}…
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* File rows */}
                                                {isExpanded && (
                                                    <div className="divide-y divide-border/50">
                                                        {group.paths.map(path => (
                                                            <div
                                                                key={path}
                                                                className={cn(
                                                                    "flex items-center gap-2.5 px-3 py-1.5 cursor-pointer group transition-all",
                                                                    selectedPaths.has(path) ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-accent/50",
                                                                    previewTarget === path && "ring-1 ring-inset ring-primary/50 bg-primary/5"
                                                                )}
                                                                onClick={() => setPreviewTarget(path)}
                                                            >
                                                                <Checkbox
                                                                    checked={selectedPaths.has(path)}
                                                                    onCheckedChange={() => toggleSelection(path)}
                                                                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                                                    className="w-3.5 h-3.5 data-[state=checked]:bg-destructive data-[state=checked]:border-destructive shrink-0"
                                                                />
                                                                {/* Path: parent dir / filename */}
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-baseline gap-1 min-w-0">
                                                                        <span className="text-[10px] text-muted-foreground/60 shrink-0">…/{getParentDir(path)}/</span>
                                                                        <span className="text-[11px] font-medium truncate text-foreground group-hover:underline underline-offset-2">{getFileName(path)}</span>
                                                                    </div>
                                                                </div>
                                                                {/* Badge: User Space / System */}
                                                                <span className={cn(
                                                                    "shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-bold hidden sm:inline",
                                                                    path.match(/[/\\]Users[/\\]/i) ? "bg-blue-500/10 text-blue-500" : "bg-muted text-muted-foreground"
                                                                )}>
                                                                    {path.match(/[/\\]Users[/\\]/i) ? "User" : "System"}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Empty / ready state ───────────────────────────────────── */}
                {!scanning && duplicates.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-10 gap-5">
                        <div className="w-20 h-20 bg-muted/30 rounded-2xl flex items-center justify-center opacity-70">
                            <CopyCheck className="w-10 h-10 text-muted-foreground" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold mb-1 text-foreground">Find Duplicates</h3>
                            <p className="text-sm text-muted-foreground max-w-[260px] leading-relaxed">
                                Add folders using the panel above, then hit <strong>Scan</strong> to find identical files.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 text-[11px] text-muted-foreground/70 text-left w-full max-w-[240px]">
                            {["Add one or more folders", "Click Scan to find duplicates", "Review groups & queue for deletion or move"].map((step, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                                    <span>{step}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Preview Panel ─────────────────────────────────────────────── */}
            {previewTarget && (
                <div className="w-[340px] flex flex-col animate-in slide-in-from-right duration-300 overflow-hidden bg-background border-l">
                    {/* Header */}
                    <div className="px-3 py-2.5 border-b bg-muted/30 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                            <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Preview</div>
                            <div className="text-[12px] font-bold truncate text-foreground" title={getFileName(previewTarget)}>
                                {getFileName(previewTarget)}
                            </div>
                        </div>
                        <Button variant="ghost" size="icon"
                            className="h-7 w-7 shrink-0 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setPreviewTarget(null)}>
                            <X className="w-3.5 h-3.5" />
                        </Button>
                    </div>

                    {/* Preview content */}
                    <div className="flex-1 min-h-0 flex items-center justify-center p-3 overflow-auto bg-muted/5">
                        <FilePreviewContent
                            path={previewTarget}
                            extension={previewTarget.split('.').pop() || ""}
                            name={getFileName(previewTarget)}
                            section="dedupe"
                            className="max-h-full max-w-full"
                        />
                    </div>

                    {/* Footer actions */}
                    <div className="px-3 py-3 border-t bg-muted/20 space-y-2.5">
                        {/* Full path */}
                        <div>
                            <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Path</div>
                            <p className="text-[10px] break-all font-mono opacity-60 leading-tight">{previewTarget}</p>
                        </div>

                        {/* Reveal / Open */}
                        <div className="flex items-center gap-1.5">
                            <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px] gap-1"
                                onClick={() => invoke("show_in_finder", { path: previewTarget })}>
                                <FolderOpen className="w-3 h-3" /> Reveal
                            </Button>
                            <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px] gap-1"
                                onClick={() => invoke("open_item", { path: previewTarget })}>
                                <RefreshCcw className="w-3 h-3" /> Open
                            </Button>
                        </div>

                        {/* Queue actions */}
                        <div className="flex flex-col gap-1.5">
                            {deleteQueue.some(e => e.path === previewTarget) ? (
                                <Button variant="outline" size="sm"
                                    className="w-full h-7 text-[10px] text-destructive bg-destructive/5 hover:bg-destructive/10 gap-1"
                                    onClick={() => handleRemoveFromDeleteQueue(previewTarget)}>
                                    <ListMinusIcon className="w-3 h-3" /> Remove from Delete Queue
                                </Button>
                            ) : (
                                <Button variant="outline" size="sm"
                                    className="w-full h-7 text-[10px] text-destructive hover:bg-destructive/10 gap-1"
                                    onClick={() => handleAddToDeleteQueue(previewTarget)}>
                                    <ListPlusIcon className="w-3 h-3" /> Add to Delete Queue
                                </Button>
                            )}

                            {moveQueues.length > 0 && (
                                findQueuesContainingPath(previewTarget).length > 0 ? (
                                    <Button variant="outline" size="sm"
                                        className="w-full h-7 text-[10px] text-primary bg-primary/5 hover:bg-primary/10 gap-1"
                                        onClick={() => handleRemoveFromMoveQueue(previewTarget)}>
                                        <ListMinusIcon className="w-3 h-3" /> Remove from Move Queue
                                    </Button>
                                ) : (
                                    <Button variant="outline" size="sm"
                                        className="w-full h-7 text-[10px] text-primary hover:bg-primary/10 gap-1"
                                        onClick={() => handleAddToMoveQueue(previewTarget)}
                                        disabled={!selectedMoveQueueId}>
                                        <FolderInputIcon className="w-3 h-3" /> Add to Move Queue
                                    </Button>
                                )
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
