import { useRef, useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDedupeStore } from "@/stores/dedupeStore";
import { Button } from "@/components/ui/button";
import { Progress } from "./ui/progress";
import { Checkbox } from "./ui/checkbox";
import {
    Search,
    Trash2,
    RefreshCcw,
    FileText,
    ChevronRight,
    Square,
    CheckSquare,
    CopyCheck,
    Loader2,
    Clock,
    FolderPlus,
    FolderOpen,
    ListPlus as ListPlusIcon,
    ListMinus as ListMinusIcon,
    FolderInput as FolderInputIcon,
    X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { open } from "@tauri-apps/plugin-dialog";
import { useDeleteQueueStore } from "@/stores/deleteQueueStore";
import { useMoveQueueStore } from "@/stores/moveQueueStore";
import { toast } from "sonner";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { FilePreviewContent } from "./FilePreviewContent";

interface DuplicateTabProps {
    tabId: string;
}

export const DuplicateTab = ({ tabId: _tabId }: DuplicateTabProps) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const scanning = useDedupeStore((state) => state.scanning);
    const progress = useDedupeStore((state) => state.progress);
    const duplicates = useDedupeStore((state) => state.duplicates);
    const selectedPaths = useDedupeStore((state) => state.selectedPaths);
    const scanQueue = useDedupeStore((state) => state.scanQueue);
    const expandedGroups = useDedupeStore((state) => state.expandedGroups);
    const previewTarget = useDedupeStore((state) => state.previewTarget);

    const startScan = useDedupeStore((state) => state.startScan);
    const resetScan = useDedupeStore((state) => state.resetScan);
    const removeFromQueue = useDedupeStore((state) => state.removeFromQueue);
    const toggleSelection = useDedupeStore((state) => state.toggleSelection);
    const toggleGroup = useDedupeStore((state) => state.toggleGroup);
    const setPreviewTarget = useDedupeStore((state) => state.setPreviewTarget);
    const selectDuplicates = useDedupeStore((state) => state.selectDuplicates);
    const deleteSelected = useDedupeStore((state) => state.deleteSelected);

    const deleteQueue = useDeleteQueueStore((state) => state.queue);
    const addToDeleteQueue = useDeleteQueueStore((state) => state.addToQueue);
    const removeFromDeleteQueue = useDeleteQueueStore((state) => state.removeFromQueue);

    const moveQueues = useMoveQueueStore((state) => state.queues);
    const addToMoveQueue = useMoveQueueStore((state) => state.addToQueue);
    const removeFromMoveQueue = useMoveQueueStore((state) => state.removeFromQueue);
    const findQueuesContainingPath = useMoveQueueStore((state) => state.findQueuesContainingPath);

    const [selectedMoveQueueId, setSelectedMoveQueueId] = useState<string>("");

    useEffect(() => {
        if (moveQueues.length === 0) setSelectedMoveQueueId("");
        else if (!selectedMoveQueueId || !moveQueues.some((q) => q.id === selectedMoveQueueId))
            setSelectedMoveQueueId(moveQueues[0].id);
    }, [moveQueues, selectedMoveQueueId]);

    const handleAddToDeleteQueue = useCallback((path: string) => {
        const name = path.split(/[/\\]/).pop() || "File";
        addToDeleteQueue({
            path,
            name,
            extension: path.split('.').pop() || "",
            size: 0,
            canonical_path: path,
            is_dir: false,
            modified: 0
        });
        toast.success(`Added ${name} to delete queue`);
    }, [addToDeleteQueue]);

    const handleRemoveFromDeleteQueue = useCallback((path: string) => {
        removeFromDeleteQueue(path);
        toast.success("Removed from delete queue");
    }, [removeFromDeleteQueue]);

    const handleAddToMoveQueue = useCallback((path: string) => {
        if (!selectedMoveQueueId) return;
        const name = path.split(/[/\\]/).pop() || "File";
        addToMoveQueue(selectedMoveQueueId, {
            path,
            name,
            extension: path.split('.').pop() || "",
            size: 0,
            canonical_path: path,
            is_dir: false,
            modified: 0
        });
        toast.success(`Added ${name} to move queue`);
    }, [selectedMoveQueueId, addToMoveQueue]);

    const handleRemoveFromMoveQueue = useCallback((path: string) => {
        const queues = findQueuesContainingPath(path);
        queues.forEach(qId => removeFromMoveQueue(qId, path));
        toast.success("Removed from move queue(s)");
    }, [findQueuesContainingPath, removeFromMoveQueue]);

    const bulkAddToDeleteQueue = useCallback(() => {
        if (selectedPaths.size === 0) return;
        selectedPaths.forEach(path => {
            const name = path.split(/[/\\]/).pop() || "File";
            addToDeleteQueue({
                path,
                name,
                extension: path.split('.').pop() || "",
                size: 0,
                canonical_path: path,
                is_dir: false,
                modified: 0
            });
        });
        toast.success(`Added ${selectedPaths.size} files to delete queue`);
    }, [selectedPaths, addToDeleteQueue]);

    const bulkAddToMoveQueue = useCallback(() => {
        if (selectedPaths.size === 0 || !selectedMoveQueueId) return;
        selectedPaths.forEach(path => {
            const name = path.split(/[/\\]/).pop() || "File";
            addToMoveQueue(selectedMoveQueueId, {
                path,
                name,
                extension: path.split('.').pop() || "",
                size: 0,
                canonical_path: path,
                is_dir: false,
                modified: 0
            });
        });
        toast.success(`Added ${selectedPaths.size} files to move queue`);
    }, [selectedPaths, selectedMoveQueueId, addToMoveQueue]);

    const formatSize = (bytes: number) => {
        const units = ["B", "KB", "MB", "GB", "TB"];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    };

    const formatDuration = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    };

    const virtualizer = useVirtualizer({
        count: duplicates.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: (index) => {
            const group = duplicates[index];
            if (group && expandedGroups.has(String(group.hash))) {
                return 42 + (group.paths.length * 30) + 8;
            }
            return 50;
        },
        overscan: 10,
    });

    useEffect(() => {
        virtualizer.measure();
    }, [duplicates, expandedGroups, previewTarget, virtualizer]);

    return (
        <div className="flex h-full bg-background border rounded-md overflow-hidden transition-colors">
            <div className="flex-1 flex flex-col min-w-0 border-r">
                <div className="bg-muted/50 p-4 border-b flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 text-primary rounded-lg">
                                <Search className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold tracking-tight text-foreground">Duplicate Finder</h2>
                                <p className="text-[11px] text-muted-foreground">Find and remove duplicate files to save space</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {duplicates.length > 0 && !scanning && (
                                <div className="flex items-center gap-1.5">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 px-3 text-xs rotate-x-180"
                                        onClick={() => startScan()}
                                        title="Refresh Scan"
                                    >
                                        <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
                                        Refresh
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 px-3 text-xs"
                                        onClick={() => resetScan()}
                                    >
                                        <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
                                        New Scan
                                    </Button>
                                </div>
                            )}
                            <Button
                                disabled={scanning || scanQueue.length === 0}
                                className="h-8 px-4 text-xs bg-primary text-primary-foreground font-bold shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all"
                                onClick={() => startScan()}
                            >
                                {scanning ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Search className="w-3.5 h-3.5 mr-1.5" />}
                                {scanning ? "Scanning..." : "Scan"}
                            </Button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 bg-background border rounded-lg p-1.5 shadow-sm">
                        <div className="flex items-center gap-1.5 px-2 border-r text-muted-foreground shrink-0">
                            <FolderPlus className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-semibold uppercase tracking-wider">Folders</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                            {scanQueue.length === 0 ? (
                                <span className="text-[11px] text-destructive/80 font-medium animate-pulse px-1">None selected</span>
                            ) : (
                                scanQueue.map(path => (
                                    <div key={path} className="group flex items-center gap-1.5 bg-background border shadow-sm px-2.5 py-1 rounded-md text-[11px] font-medium hover:border-primary/40 hover:bg-primary/5 transition-all max-w-[200px]">
                                        <FolderOpen className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                                        <span className="truncate" title={path}>{path.split(/[/\\]/).pop() || path}</span>
                                        <button
                                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive rounded-sm ml-0.5 shrink-0"
                                            onClick={() => removeFromQueue(path)}
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-3 text-xs gap-1.5 text-primary hover:bg-primary/10 shrink-0"
                            onClick={() => {
                                open({
                                    directory: true,
                                    multiple: true,
                                    title: "Select Folders to Scan"
                                }).then(selected => {
                                    if (selected) {
                                        const items = Array.isArray(selected) ? selected : [selected];
                                        const paths = items.map(item => {
                                            if (typeof item === 'string') return item;
                                            return (item as any).path || String(item);
                                        });
                                        paths.forEach(p => {
                                            if (p) useDedupeStore.getState().addToQueue(p);
                                        });
                                    }
                                }).catch(err => {
                                    console.error("Failed to add folders:", err);
                                });
                            }}
                        >
                            <FolderPlus className="w-3.5 h-3.5" />
                            Add Folder
                        </Button>
                    </div>
                </div>

                {scanning && progress && (
                    <div className="p-4 border-b bg-primary/5 space-y-3">
                        <div className="flex justify-between items-end mb-1">
                            <div className="space-y-1">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-primary">{progress.status}</div>
                                <div className="text-sm font-medium max-w-md truncate text-muted-foreground">{progress.current_path}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-bold tracking-tighter text-foreground">{progress.scanned}</div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Files Reviewed</div>
                            </div>
                        </div>
                        <div className="relative h-1.5 w-full bg-secondary rounded-full overflow-hidden text-foreground">
                            {progress.status.includes("Discovery") ? (
                                <div className="absolute inset-0 bg-primary animate-progress-indeterminate origin-left w-1/3" />
                            ) : (
                                <Progress
                                    value={(() => {
                                        const match = progress.status.match(/\((\d+)%\)/);
                                        return match ? parseInt(match[1]) : 0;
                                    })()}
                                    className="h-full"
                                />
                            )}
                        </div>
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                            <div className="flex items-center gap-4">
                                <span>{progress.status.includes("Discovery") ? "Walking directory tree..." : "Analyzing matching files..."}</span>
                                <span className="flex items-center gap-1.5 text-primary/60">
                                    <Clock className="w-3 h-3" />
                                    {formatDuration(progress.elapsed_ms)}
                                </span>
                            </div>
                            <span>{duplicates.length} groups found</span>
                        </div>
                    </div>
                )}

                {!scanning && duplicates.length > 0 && (
                    <div className="flex-1 flex flex-col overflow-hidden text-foreground">
                        <div className="bg-muted/30 px-4 py-2 border-b flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex flex-col">
                                    <span className="text-[9px] uppercase text-muted-foreground font-bold tracking-wider">Time Taken</span>
                                    <span className="text-xs font-bold text-primary flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {progress ? formatDuration(progress.elapsed_ms) : "N/A"}
                                    </span>
                                </div>
                                <div className="h-6 w-[1px] bg-border mx-1" />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-[11px] font-medium gap-1.5 hover:bg-primary/10 hover:text-primary transition-colors"
                                    onClick={() => {
                                        if (selectedPaths.size > 0) {
                                            selectDuplicates("none");
                                        } else {
                                            selectDuplicates("all-but-newest");
                                        }
                                    }}
                                >
                                    {selectedPaths.size > 0 ? (
                                        <>
                                            <CheckSquare className="w-3.5 h-3.5" />
                                            Deselect All
                                        </>
                                    ) : (
                                        <>
                                            <Square className="w-3.5 h-3.5" />
                                            Select All But One
                                        </>
                                    )}
                                </Button>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-muted-foreground">
                                    {selectedPaths.size} selected
                                </span>
                                <div className="h-5 w-[1px] bg-border mx-0.5" />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2.5 text-[11px] font-medium text-destructive hover:bg-destructive/10"
                                    disabled={selectedPaths.size === 0}
                                    onClick={bulkAddToDeleteQueue}
                                    title="Add selected to delete queue"
                                >
                                    <ListPlusIcon className="w-3.5 h-3.5 mr-1" />
                                    Queue Delete
                                </Button>

                                {moveQueues.length > 0 && (
                                    <>
                                        <Select value={selectedMoveQueueId} onValueChange={setSelectedMoveQueueId}>
                                            <SelectTrigger className="h-7 w-[120px] text-[11px]">
                                                <SelectValue placeholder="Move Queue" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {moveQueues.map(q => (
                                                    <SelectItem key={q.id} value={q.id}>
                                                        {q.name} ({q.items.length})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 px-2.5 text-[11px] font-medium text-primary hover:bg-primary/10"
                                            disabled={selectedPaths.size === 0 || !selectedMoveQueueId}
                                            onClick={bulkAddToMoveQueue}
                                            title="Add selected to move queue"
                                        >
                                            <FolderInputIcon className="w-3.5 h-3.5 mr-1" />
                                            Queue Move
                                        </Button>
                                    </>
                                )}

                                <div className="h-5 w-[1px] bg-border mx-0.5" />
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-7 px-3 text-[11px] font-medium shadow-sm shadow-destructive/20"
                                    disabled={selectedPaths.size === 0}
                                    onClick={deleteSelected}
                                >
                                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                                    Clean Files
                                </Button>
                            </div>
                        </div>

                        <div ref={scrollRef} className="flex-1 overflow-auto min-h-0">
                            <div
                                style={{ height: virtualizer.getTotalSize(), position: "relative" }}
                                className="w-full"
                            >
                                {virtualizer.getVirtualItems().map((virtualRow) => {
                                    const group = duplicates[virtualRow.index];
                                    if (!group) return null;
                                    const isExpanded = expandedGroups.has(String(group.hash));

                                    return (
                                        <div
                                            key={String(group.hash)}
                                            data-index={virtualRow.index}
                                            ref={virtualizer.measureElement}
                                            className="absolute top-0 left-0 w-full px-4 py-1"
                                            style={{
                                                transform: `translateY(${virtualRow.start}px)`,
                                            }}
                                        >
                                            <div className="bg-muted/10 border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                                <div
                                                    className="bg-muted/30 px-3 py-2 border-b flex justify-between items-center cursor-pointer hover:bg-muted/40 transition-colors"
                                                    onClick={() => toggleGroup(String(group.hash))}
                                                >
                                                    <div className="flex items-center gap-2.5">
                                                        <ChevronRight className={cn(
                                                            "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
                                                            isExpanded && "rotate-90"
                                                        )} />
                                                        <div className="p-1.5 bg-background rounded-md border shadow-sm flex items-center justify-center">
                                                            <FileText className="w-3.5 h-3.5 text-primary" />
                                                        </div>
                                                        <div>
                                                            <div className="text-[11px] font-semibold truncate max-w-[250px] leading-tight flex items-center">
                                                                {group.paths[0].split(/[/\\]/).pop()}
                                                            </div>
                                                            <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-none mt-1.5">
                                                                {formatSize(group.size)} • {group.paths.length} Copies
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-[9px] font-mono text-muted-foreground/40 uppercase">
                                                        Hash: {String(group.hash).slice(0, 8)}...
                                                    </div>
                                                </div>

                                                {isExpanded && (
                                                    <div className="p-1 space-y-0.5">
                                                        {group.paths.map(path => (
                                                            <div
                                                                key={path}
                                                                className={cn(
                                                                    "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-all cursor-pointer group",
                                                                    selectedPaths.has(path) ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-accent",
                                                                    previewTarget === path && "ring-1 ring-primary ring-inset bg-primary/5"
                                                                )}
                                                                onClick={() => setPreviewTarget(path)}
                                                            >
                                                                <Checkbox
                                                                    checked={selectedPaths.has(path)}
                                                                    onCheckedChange={() => toggleSelection(path)}
                                                                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                                                    className="w-3.5 h-3.5 data-[state=checked]:bg-destructive data-[state=checked]:border-destructive"
                                                                />
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="text-[11px] font-medium truncate group-hover:underline lowercase opacity-80 group-hover:opacity-100">{path}</div>
                                                                </div>
                                                                <div className="text-[9px] font-bold text-muted-foreground/50 uppercase group-hover:text-primary transition-colors">
                                                                    {path.match(/[/\\]Users[/\\]/i) ? "User Space" : "System"}
                                                                </div>
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

                {!scanning && duplicates.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-12 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
                        <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
                            <CopyCheck className="w-12 h-12 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-bold mb-2 text-foreground">Ready to Scan</h3>
                        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                            Select folders from the sidebar to start finding identical files and freeing up storage space.
                        </p>
                    </div>
                )}
            </div>

            {previewTarget && (
                <div className="w-[320px] flex flex-col animate-in slide-in-from-right duration-300 overflow-hidden bg-muted/5 border-l">
                    <div className="p-3 border-b flex items-center justify-between bg-muted/30">
                        <div className="flex flex-col">
                            <span className="text-[9px] uppercase text-muted-foreground font-bold tracking-wider">File Preview</span>
                            <span className="text-[11px] font-bold truncate max-w-[200px] text-foreground">
                                {previewTarget.split(/[/\\]/).pop()}
                            </span>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setPreviewTarget(null)}
                            className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive text-foreground"
                        >
                            <X className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                    <div className="flex-1 p-4 flex items-center justify-center overflow-auto">
                        <FilePreviewContent
                            path={previewTarget}
                            extension={previewTarget.split('.').pop() || ""}
                            name={previewTarget.split(/[/\\]/).pop() || ""}
                            section="dedupe"
                            className="max-h-full"
                        />
                    </div>
                    <div className="p-3 border-t bg-muted/30 space-y-2">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] uppercase text-muted-foreground font-bold tracking-wider">Full Path</span>
                            <span className="text-[10px] break-all font-mono opacity-70 text-foreground leading-tight">{previewTarget}</span>
                        </div>
                        <div className="flex items-center gap-1.5 pt-1.5">
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 h-7 text-[10px] text-foreground"
                                onClick={() => invoke("show_in_finder", { path: previewTarget })}
                            >
                                <FolderOpen className="w-3 h-3 mr-1.5" />
                                Reveal
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 h-7 text-[10px] text-foreground"
                                onClick={() => invoke("open_item", { path: previewTarget })}
                            >
                                <RefreshCcw className="w-3 h-3 mr-1.5" />
                                Open
                            </Button>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            {deleteQueue.some(e => e.path === previewTarget) ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full h-7 text-[10px] text-destructive bg-destructive/5 hover:bg-destructive/10"
                                    onClick={() => handleRemoveFromDeleteQueue(previewTarget)}
                                >
                                    <ListMinusIcon className="w-3 h-3 mr-1.5" />
                                    Unqueue Delete
                                </Button>
                            ) : (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full h-7 text-[10px] text-destructive hover:bg-destructive/10"
                                    onClick={() => handleAddToDeleteQueue(previewTarget)}
                                >
                                    <ListPlusIcon className="w-3 h-3 mr-1.5" />
                                    Queue Delete
                                </Button>
                            )}

                            {moveQueues.length > 0 && (
                                <>
                                    {findQueuesContainingPath(previewTarget).length > 0 ? (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full h-7 text-[10px] text-primary bg-primary/5 hover:bg-primary/10"
                                            onClick={() => handleRemoveFromMoveQueue(previewTarget)}
                                        >
                                            <ListMinusIcon className="w-3 h-3 mr-1.5" />
                                            Unqueue Move
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full h-7 text-[10px] text-primary hover:bg-primary/10"
                                            onClick={() => handleAddToMoveQueue(previewTarget)}
                                            disabled={!selectedMoveQueueId}
                                        >
                                            <FolderInputIcon className="w-3 h-3 mr-1.5" />
                                            Queue Move
                                        </Button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
