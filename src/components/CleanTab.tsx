import { useRef } from "react";
import { useCleanStore } from "@/stores/cleanStore";
import { Button } from "@/components/ui/button";
import { Progress } from "./ui/progress";
import { Checkbox } from "./ui/checkbox";
import {
    Search,
    Trash2,
    RefreshCcw,
    FolderPlus,
    FolderOpen,
    Loader2,
    Clock,
    X,
    Eraser,
    CheckSquare,
    Square,
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
                <div className="bg-muted/50 p-4 border-b flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 text-primary rounded-lg">
                                <Eraser className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold tracking-tight text-foreground">Clean View</h2>
                                <p className="text-[11px] text-muted-foreground">Find and delete recursive empty folders to keep your filesystem organized</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {findings.length > 0 && !scanning && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-3 text-xs"
                                    onClick={() => resetScan()}
                                >
                                    <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
                                    New Scan
                                </Button>
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
                                        items.forEach(p => {
                                            if (p) addToQueue(typeof p === 'string' ? p : (p as any).path);
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
                                <div className="text-xs font-medium max-w-md truncate text-muted-foreground">{progress.current_path}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-xl font-bold tracking-tighter text-foreground">{progress.scanned_folders}</div>
                                <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Folders Reviewed</div>
                            </div>
                        </div>
                        <Progress value={0} className="h-1.5 w-full bg-secondary overflow-hidden">
                            <div className="h-full bg-primary animate-progress-indeterminate origin-left w-1/3" />
                        </Progress>
                        <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">
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
                        <div className="bg-muted/30 px-4 py-2 border-b flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-[11px] font-medium gap-1.5 hover:bg-primary/10 hover:text-primary transition-colors"
                                    onClick={selectAll}
                                >
                                    <CheckSquare className="w-3.5 h-3.5" />
                                    Select All
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-[11px] font-medium gap-1.5 text-muted-foreground hover:bg-primary/5 transition-colors"
                                    onClick={selectNone}
                                >
                                    <Square className="w-3.5 h-3.5" />
                                    Deselect All
                                </Button>
                                <div className="h-6 w-[1px] bg-border mx-1" />
                                <span className="text-xs font-bold text-muted-foreground">
                                    {selectedPaths.size} folders selected
                                </span>
                            </div>
                            <Button
                                variant="destructive"
                                size="sm"
                                className="h-7 px-2.5 text-[11px] font-medium shadow-sm shadow-destructive/20"
                                disabled={selectedPaths.size === 0}
                                onClick={deleteSelected}
                            >
                                <Trash2 className="w-3.5 h-3.5 mr-1" />
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
                                                    "flex items-center gap-3 px-3 py-2 border rounded-lg transition-all cursor-pointer group",
                                                    selectedPaths.has(folder.path) ? "bg-destructive/5 border-destructive/20" : "hover:bg-accent hover:border-accent-foreground/10 bg-muted/5"
                                                )}
                                                onClick={() => toggleSelection(folder.path)}
                                            >
                                                <Checkbox
                                                    checked={selectedPaths.has(folder.path)}
                                                    onCheckedChange={() => toggleSelection(folder.path)}
                                                    className="data-[state=checked]:bg-destructive data-[state=checked]:border-destructive w-3.5 h-3.5"
                                                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                                />
                                                <div className="p-1.5 bg-background rounded-md border shadow-sm group-hover:scale-110 transition-transform">
                                                    <FileQuestion className="w-3.5 h-3.5 text-orange-500" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[11px] font-bold truncate group-hover:text-primary transition-colors">{folder.name}</div>
                                                    <div className="text-[9px] text-muted-foreground truncate opacity-60 font-mono tracking-tighter mt-0.5">{folder.path}</div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        invoke("show_in_finder", { path: folder.path });
                                                    }}
                                                >
                                                    <FolderOpen className="w-3.5 h-3.5" />
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
