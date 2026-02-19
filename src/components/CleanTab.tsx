import { useRef } from "react";
import { useCleanStore } from "@/stores/cleanStore";
import { Button } from "@/components/ui/button";
import { Progress } from "./ui/progress";
import { Checkbox } from "./ui/checkbox";
import {
    Search,
    Trash2,
    RefreshCcw,
    AlertTriangle,
    FolderPlus,
    FolderOpen,
    Loader2,
    Clock,
    X,
    Eraser,
    CheckSquare,
    Square,
    ChevronRight,
    FileQuestion
} from "lucide-react";
import { cn } from "@/lib/utils";
import { open } from "@tauri-apps/plugin-dialog";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";

interface CleanTabProps {
    tabId: string;
}

export const CleanTab = ({ tabId: _tabId }: CleanTabProps) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const scanning = useCleanStore((state) => state.scanning);
    const progress = useCleanStore((state) => state.progress);
    const findings = useCleanStore((state) => state.findings);
    const selectedPaths = useCleanStore((state) => state.selectedPaths);
    const scanQueue = useCleanStore((state) => state.scanQueue);

    const startScan = useCleanStore((state) => state.startScan);
    const resetScan = useCleanStore((state) => state.resetScan);
    const addToQueue = useCleanStore((state) => state.addToQueue);
    const removeFromQueue = useCleanStore((state) => state.removeFromQueue);
    const toggleSelection = useCleanStore((state) => state.toggleSelection);
    const selectAll = useCleanStore((state) => state.selectAll);
    const selectNone = useCleanStore((state) => state.selectNone);
    const deleteSelected = useCleanStore((state) => state.deleteSelected);

    const formatDuration = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    };

    const virtualizer = useVirtualizer({
        count: findings.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => 50,
        overscan: 10,
    });

    return (
        <div className="flex h-full bg-background border rounded-md overflow-hidden transition-colors">
            <div className="flex-1 flex flex-col min-w-0">
                <div className="bg-muted/50 p-6 border-b">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight text-foreground">Clean View</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                Find and delete recursive empty folders to keep your filesystem organized.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {findings.length > 0 && !scanning && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-9 px-4"
                                    onClick={() => resetScan()}
                                >
                                    <RefreshCcw className="w-4 h-4 mr-2" />
                                    New Scan
                                </Button>
                            )}
                            <Button
                                disabled={scanning || scanQueue.length === 0}
                                className="h-9 px-6 bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                onClick={() => startScan()}
                            >
                                {scanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                                {scanning ? "Scanning..." : "Start Scan"}
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Included Folders</h3>
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
                                            items.forEach(p => {
                                                if (p) addToQueue(typeof p === 'string' ? p : (p as any).path);
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
                                        <X className="w-2.5 h-2.5" />
                                    </Button>
                                </div>
                            ))}
                            {scanQueue.length === 0 && (
                                <div className="flex items-center gap-2 text-destructive text-xs font-medium bg-destructive/10 px-3 py-1.5 rounded-lg border border-destructive/20 animate-pulse">
                                    <AlertTriangle className="w-3 h-3" />
                                    Select folders from the sidebar or click "Add Folders" to start.
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
                                <div className="text-2xl font-bold tracking-tighter text-foreground">{progress.scanned_folders}</div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Folders Reviewed</div>
                            </div>
                        </div>
                        <Progress value={0} className="h-1.5 w-full bg-secondary overflow-hidden">
                            <div className="h-full bg-primary animate-progress-indeterminate origin-left w-1/3" />
                        </Progress>
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                            <div className="flex items-center gap-4">
                                <span>Analyzing folder hierarchy...</span>
                                <span className="flex items-center gap-1.5 text-primary/60">
                                    <Clock className="w-3 h-3" />
                                    {formatDuration(progress.elapsed_ms)}
                                </span>
                            </div>
                            <span>{findings.length} empty folders found</span>
                        </div>
                    </div>
                )}

                {!scanning && findings.length > 0 && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="bg-muted/30 px-6 py-3 border-b flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs font-bold gap-2 hover:bg-primary/10 hover:text-primary transition-colors"
                                    onClick={selectAll}
                                >
                                    <CheckSquare className="w-4 h-4" />
                                    Select All
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs font-bold gap-2 text-muted-foreground hover:bg-primary/5 transition-colors"
                                    onClick={selectNone}
                                >
                                    <Square className="w-4 h-4" />
                                    Deselect All
                                </Button>
                                <div className="h-8 w-[1px] bg-border mx-2" />
                                <span className="text-xs font-bold text-muted-foreground">
                                    {selectedPaths.size} folders selected for deletion
                                </span>
                            </div>
                            <Button
                                variant="destructive"
                                size="sm"
                                className="h-8 font-bold shadow-lg shadow-destructive/20"
                                disabled={selectedPaths.size === 0}
                                onClick={deleteSelected}
                            >
                                <Trash2 className="w-3.5 h-3.5 mr-2" />
                                Delete Empty Folders
                            </Button>
                        </div>

                        <div ref={scrollRef} className="flex-1 overflow-auto min-h-0">
                            <div
                                style={{ height: virtualizer.getTotalSize(), position: "relative" }}
                                className="w-full"
                            >
                                {virtualizer.getVirtualItems().map((virtualRow) => {
                                    const folder = findings[virtualRow.index];
                                    if (!folder) return null;

                                    return (
                                        <div
                                            key={folder.path}
                                            data-index={virtualRow.index}
                                            ref={virtualizer.measureElement}
                                            className="absolute top-0 left-0 w-full px-6 py-1"
                                            style={{
                                                transform: `translateY(${virtualRow.start}px)`,
                                            }}
                                        >
                                            <div
                                                className={cn(
                                                    "flex items-center gap-4 px-4 py-3 border rounded-xl transition-all cursor-pointer group",
                                                    selectedPaths.has(folder.path) ? "bg-destructive/5 border-destructive/20" : "hover:bg-accent hover:border-accent-foreground/10 bg-muted/5"
                                                )}
                                                onClick={() => toggleSelection(folder.path)}
                                            >
                                                <Checkbox
                                                    checked={selectedPaths.has(folder.path)}
                                                    onCheckedChange={() => toggleSelection(folder.path)}
                                                    className="data-[state=checked]:bg-destructive data-[state=checked]:border-destructive"
                                                />
                                                <div className="p-1.5 bg-background rounded-md border shadow-sm group-hover:scale-110 transition-transform">
                                                    <FileQuestion className="w-4 h-4 text-orange-500" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-bold truncate group-hover:text-primary transition-colors">{folder.name}</div>
                                                    <div className="text-[10px] text-muted-foreground truncate opacity-60 font-mono tracking-tighter">{folder.path}</div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        invoke("show_in_finder", { path: folder.path });
                                                    }}
                                                >
                                                    <FolderOpen className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {!scanning && findings.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-12 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
                        <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
                            <Eraser className="w-12 h-12 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-bold mb-2 text-foreground">Scan for Empty Folders</h3>
                        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                            Folders that contain no files and no non-empty subfolders will appear here.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
