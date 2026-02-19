import { useRef, useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useContentTypeStore } from "@/stores/contentTypeStore";
import { Button } from "@/components/ui/button";
import { Progress } from "./ui/progress";
import { Checkbox } from "./ui/checkbox";
import {
    Search,
    RefreshCcw,
    AlertTriangle,
    FileText,
    ChevronRight,
    Loader2,
    Clock,
    FolderPlus,
    FolderOpen,
    ListPlus as ListPlusIcon,
    ListMinus as ListMinusIcon,
    FolderInput as FolderInputIcon,
    X,
    FileSearch,
    Video,
    Image as ImageIcon,
    Music,
    Archive,
    Trash2,
    LayoutGrid
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

interface ContentTypeTabProps {
    tabId: string;
}

export const ContentTypeTab = ({ tabId: _tabId }: ContentTypeTabProps) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const scanning = useContentTypeStore((state) => state.scanning);
    const progress = useContentTypeStore((state) => state.progress);
    const groups = useContentTypeStore((state) => state.groups);
    const scanQueue = useContentTypeStore((state) => state.scanQueue);
    const expandedCategories = useContentTypeStore((state) => state.expandedCategories);

    // Local selection state for bulk actions
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
    const [previewTarget, setPreviewTarget] = useState<string | null>(null);

    const startScan = useContentTypeStore((state) => state.startScan);
    const reset = useContentTypeStore((state) => state.reset);
    const addToQueue = useContentTypeStore((state) => state.addToQueue);
    const removeFromQueue = useContentTypeStore((state) => state.removeFromQueue);
    const toggleCategory = useContentTypeStore((state) => state.toggleCategory);

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

    const toggleSelection = useCallback((path: string) => {
        setSelectedPaths(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    }, []);

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

    const formatDuration = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    };

    const getCategoryIcon = (category: string) => {
        switch (category.toLowerCase()) {
            case "images": return <ImageIcon className="w-4 h-4 text-pink-500" />;
            case "videos": return <Video className="w-4 h-4 text-red-500" />;
            case "audio": return <Music className="w-4 h-4 text-purple-500" />;
            case "documents": return <FileText className="w-4 h-4 text-blue-500" />;
            case "archives": return <Archive className="w-4 h-4 text-orange-500" />;
            default: return <FileSearch className="w-4 h-4 text-primary" />;
        }
    };

    const virtualizer = useVirtualizer({
        count: groups.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: (index) => {
            const group = groups[index];
            if (group && expandedCategories.has(String(group.category))) {
                return 60 + (group.paths.length * 40) + 12;
            }
            return 68;
        },
        overscan: 10,
    });

    useEffect(() => {
        virtualizer.measure();
    }, [groups, expandedCategories, previewTarget, virtualizer]);

    return (
        <div className="flex h-full bg-background border rounded-md overflow-hidden transition-colors">
            <div className="flex-1 flex flex-col min-w-0 border-r">
                <div className="bg-muted/50 p-6 border-b">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight text-foreground">Content Search</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                Search and manage files grouped by category across your folders.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {groups.length > 0 && !scanning && (
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-9 px-4"
                                        onClick={() => startScan()}
                                        title="Refresh Scan"
                                    >
                                        <RefreshCcw className="w-4 h-4 mr-2" />
                                        Refresh
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-9 px-4"
                                        onClick={() => {
                                            reset();
                                            setSelectedPaths(new Set());
                                            setPreviewTarget(null);
                                        }}
                                    >
                                        <RefreshCcw className="w-4 h-4 mr-2" />
                                        New Search
                                    </Button>
                                </div>
                            )}
                            <Button
                                disabled={scanning || scanQueue.length === 0}
                                className="h-9 px-6 bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                onClick={() => startScan()}
                            >
                                {scanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                                {scanning ? "Searching..." : "Start Search"}
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Folders to Scan</h3>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] gap-1 text-primary hover:bg-primary/10"
                                onClick={async () => {
                                    try {
                                        const selected = await open({
                                            directory: true,
                                            multiple: true,
                                            title: "Select Folders to Scan"
                                        });
                                        if (selected) {
                                            const items = Array.isArray(selected) ? selected : [selected];
                                            const paths = items.map(item => typeof item === 'string' ? item : (item as any).path);
                                            paths.forEach(p => {
                                                if (p) addToQueue(p);
                                            });
                                        }
                                    } catch (err) {
                                        console.error("Failed to add folders:", err);
                                    }
                                }}
                            >
                                <FolderPlus className="w-3 h-3" />
                                Add Folders
                            </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {scanQueue.map(path => (
                                <div key={path} className="group flex items-center gap-2 bg-background border px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm hover:border-primary/50 transition-colors">
                                    <ChevronRight className="w-3 h-3 text-primary" />
                                    <span className="max-w-[200px] truncate lowercase">{path}</span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4 ml-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground rounded-sm"
                                        onClick={() => removeFromQueue(path)}
                                    >
                                        <Trash2 className="w-2.5 h-2.5" />
                                    </Button>
                                </div>
                            ))}
                            {scanQueue.length === 0 && (
                                <div className="flex items-center gap-2 text-destructive text-xs font-medium bg-destructive/10 px-3 py-1.5 rounded-lg border border-destructive/20 animate-pulse">
                                    <AlertTriangle className="w-3 h-3" />
                                    Add at least one folder and then hit Start Search.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {scanning && progress && (
                    <div className="p-8 border-b bg-primary/5 space-y-4">
                        <div className="flex justify-between items-end mb-1">
                            <div className="space-y-1">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-primary">{progress.status}</div>
                                <div className="text-sm font-medium max-w-md truncate text-muted-foreground">{progress.current_path}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-bold tracking-tighter text-foreground">{progress.scanned}</div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Files Found</div>
                            </div>
                        </div>
                        <Progress value={0} className="h-1.5" />
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                            <div className="flex items-center gap-4">
                                <span>Scanning directory trees...</span>
                                <span className="flex items-center gap-1.5 text-primary/60">
                                    <Clock className="w-3 h-3" />
                                    {formatDuration(progress.elapsed_ms)}
                                </span>
                            </div>
                            <span>{groups.length} categories active</span>
                        </div>
                    </div>
                )}

                {!scanning && groups.length > 0 && (
                    <div className="flex-1 flex flex-col overflow-hidden text-foreground">
                        <div className="bg-muted/30 px-6 py-3 border-b flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="flex flex-col">
                                    <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Time Taken</span>
                                    <span className="text-xs font-bold text-primary flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {progress ? formatDuration(progress.elapsed_ms) : "N/A"}
                                    </span>
                                </div>
                                <div className="h-8 w-[1px] bg-border mx-2" />
                                <span className="text-xs font-bold text-muted-foreground">
                                    {selectedPaths.size} items selected
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs font-bold gap-2 text-muted-foreground hover:bg-primary/5 transition-colors"
                                    onClick={() => setSelectedPaths(new Set())}
                                >
                                    Deselect All
                                </Button>
                            </div>
                            <div className="flex items-center gap-4">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 font-bold text-destructive hover:bg-destructive/10"
                                    disabled={selectedPaths.size === 0}
                                    onClick={bulkAddToDeleteQueue}
                                >
                                    <ListPlusIcon className="w-3.5 h-3.5 mr-1" />
                                    Queue Delete
                                </Button>

                                {moveQueues.length > 0 && (
                                    <>
                                        <Select value={selectedMoveQueueId} onValueChange={setSelectedMoveQueueId}>
                                            <SelectTrigger className="h-8 w-[140px] text-xs">
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
                                            className="h-8 font-bold text-primary hover:bg-primary/10"
                                            disabled={selectedPaths.size === 0 || !selectedMoveQueueId}
                                            onClick={bulkAddToMoveQueue}
                                        >
                                            <FolderInputIcon className="w-3.5 h-3.5 mr-1" />
                                            Queue Move
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>

                        <div ref={scrollRef} className="flex-1 overflow-auto min-h-0">
                            <div
                                style={{ height: virtualizer.getTotalSize(), position: "relative" }}
                                className="w-full"
                            >
                                {virtualizer.getVirtualItems().map((virtualRow) => {
                                    const group = groups[virtualRow.index];
                                    if (!group) return null;
                                    const isExpanded = expandedCategories.has(String(group.category));

                                    return (
                                        <div
                                            key={String(group.category)}
                                            data-index={virtualRow.index}
                                            ref={virtualizer.measureElement}
                                            className="absolute top-0 left-0 w-full px-6 py-1.5"
                                            style={{
                                                transform: `translateY(${virtualRow.start}px)`,
                                            }}
                                        >
                                            <div className="bg-muted/10 border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                                <div
                                                    className="bg-muted/30 px-4 py-3 border-b flex justify-between items-center cursor-pointer hover:bg-muted/40 transition-colors"
                                                    onClick={() => toggleCategory(String(group.category))}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <ChevronRight className={cn(
                                                            "w-4 h-4 text-muted-foreground transition-transform duration-200",
                                                            isExpanded && "rotate-90"
                                                        )} />
                                                        <div className="p-1.5 bg-background rounded-md border shadow-sm">
                                                            {getCategoryIcon(String(group.category))}
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-bold truncate">
                                                                {group.category}
                                                            </div>
                                                            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                                                {group.paths.length} Files found
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {isExpanded && (
                                                    <div className="p-2 space-y-1">
                                                        {group.paths.map(path => (
                                                            <div
                                                                key={path}
                                                                className={cn(
                                                                    "flex items-center gap-3 px-3 py-2 rounded-lg transition-all cursor-pointer group",
                                                                    selectedPaths.has(path) ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-accent",
                                                                    previewTarget === path && "ring-2 ring-primary ring-inset bg-primary/5"
                                                                )}
                                                                onClick={() => setPreviewTarget(path)}
                                                            >
                                                                <Checkbox
                                                                    checked={selectedPaths.has(path)}
                                                                    onCheckedChange={() => toggleSelection(path)}
                                                                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                                                />
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="text-xs font-medium truncate group-hover:underline lowercase opacity-80 group-hover:opacity-100">{path}</div>
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

                {!scanning && groups.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-12 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
                        <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
                            <LayoutGrid className="w-12 h-12 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-bold mb-2 text-foreground">Find Content by Type</h3>
                        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                            Organize your files by scanning for specific types like Videos, Images, or Archives.
                        </p>
                    </div>
                )}
            </div>

            {previewTarget && (
                <div className="w-[450px] flex flex-col animate-in slide-in-from-right duration-300 overflow-hidden bg-muted/5">
                    <div className="p-4 border-b flex items-center justify-between bg-muted/30">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">File Preview</span>
                            <span className="text-xs font-bold truncate max-w-[300px] text-foreground">
                                {previewTarget.split(/[/\\]/).pop()}
                            </span>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setPreviewTarget(null)}
                            className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive text-foreground"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                    <div className="flex-1 p-6 flex items-center justify-center overflow-auto">
                        <FilePreviewContent
                            path={previewTarget}
                            extension={previewTarget.split('.').pop() || ""}
                            name={previewTarget.split(/[/\\]/).pop() || ""}
                            section="content_search"
                            className="max-h-full"
                        />
                    </div>
                    <div className="p-4 border-t bg-muted/30 space-y-3">
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Full Path</span>
                            <span className="text-[10px] break-all font-mono opacity-70 text-foreground">{previewTarget}</span>
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 text-foreground"
                                onClick={() => invoke("show_in_finder", { path: previewTarget })}
                            >
                                <FolderOpen className="w-3.5 h-3.5 mr-2" />
                                Reveal
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 text-foreground"
                                onClick={() => invoke("open_item", { path: previewTarget })}
                            >
                                <RefreshCcw className="w-3.5 h-3.5 mr-2" />
                                Open
                            </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {deleteQueue.some(e => e.path === previewTarget) ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 text-destructive bg-destructive/5 hover:bg-destructive/10"
                                    onClick={() => handleRemoveFromDeleteQueue(previewTarget)}
                                >
                                    <ListMinusIcon className="w-3.5 h-3.5 mr-2" />
                                    Unqueue Delete
                                </Button>
                            ) : (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 text-destructive hover:bg-destructive/10"
                                    onClick={() => handleAddToDeleteQueue(previewTarget)}
                                >
                                    <ListPlusIcon className="w-3.5 h-3.5 mr-2" />
                                    Queue Delete
                                </Button>
                            )}

                            {moveQueues.length > 0 && (
                                <>
                                    {findQueuesContainingPath(previewTarget).length > 0 ? (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="flex-1 text-primary bg-primary/5 hover:bg-primary/10"
                                            onClick={() => handleRemoveFromMoveQueue(previewTarget)}
                                        >
                                            <ListMinusIcon className="w-3.5 h-3.5 mr-2" />
                                            Unqueue Move
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="flex-1 text-primary hover:bg-primary/10"
                                            onClick={() => handleAddToMoveQueue(previewTarget)}
                                            disabled={!selectedMoveQueueId}
                                        >
                                            <FolderInputIcon className="w-3.5 h-3.5 mr-2" />
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
