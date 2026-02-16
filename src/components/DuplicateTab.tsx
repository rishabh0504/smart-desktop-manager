import { useDedupeStore } from "@/stores/dedupeStore";
import { Button } from "@/components/ui/button";
import { Progress } from "./ui/progress";
import { ScrollArea } from "./ui/scroll-area";
import { Checkbox } from "./ui/checkbox";
import {
    Search,
    Trash2,
    RefreshCcw,
    AlertTriangle,
    FileText,
    CheckSquare,
    Square,
    ChevronRight,
    Loader2,
    CopyCheck,
    Clock,
    FolderPlus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { open } from "@tauri-apps/plugin-dialog";

interface DuplicateTabProps {
    tabId: string;
}

export const DuplicateTab = ({ tabId: _tabId }: DuplicateTabProps) => {
    const scanning = useDedupeStore((state) => state.scanning);
    const progress = useDedupeStore((state) => state.progress);
    const duplicates = useDedupeStore((state) => state.duplicates);
    const selectedPaths = useDedupeStore((state) => state.selectedPaths);
    const scanQueue = useDedupeStore((state) => state.scanQueue);
    const startScan = useDedupeStore((state) => state.startScan);
    const resetScan = useDedupeStore((state) => state.resetScan);
    const removeFromQueue = useDedupeStore((state) => state.removeFromQueue);
    const toggleSelection = useDedupeStore((state) => state.toggleSelection);
    const selectDuplicates = useDedupeStore((state) => state.selectDuplicates);
    const deleteSelected = useDedupeStore((state) => state.deleteSelected);

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

    return (
        <div className="flex flex-col h-full bg-background border rounded-md overflow-hidden transition-colors">
            {/* Header / Config */}
            <div className="bg-muted/50 p-6 border-b">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">Duplicate Finder</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Find and remove duplicate files across your open folders.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {duplicates.length > 0 && !scanning && (
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
                                        const paths = Array.isArray(selected) ? selected : [selected];
                                        // We need to access useDedupeStore.getState().addToQueue outside or loop here
                                        // The component has addToQueue accessible? No, it has removeFromQueue.
                                        // I need to add addToQueue to the selector or import store.
                                        // Let's modify the selector at the top first.
                                        // Wait, I can't modify the selector effectively in this replace block without changing the top of the file.
                                        // I'll assume I can just use the store instance directly or loop.
                                        // Better: useDedupeStore.getState().addToQueue(p);
                                        paths.forEach(p => useDedupeStore.getState().addToQueue(p));
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
                                Add at least one folder to start scanning.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Scan Progress */}
            {scanning && progress && (
                <div className="p-8 border-b bg-primary/5 space-y-4">
                    <div className="flex justify-between items-end mb-1">
                        <div className="space-y-1">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-primary">{progress.status}</div>
                            <div className="text-sm font-medium max-w-md truncate text-muted-foreground">{progress.current_path}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-2xl font-bold tracking-tighter">{progress.scanned}</div>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Files Reviewed</div>
                        </div>
                    </div>
                    {/* Progress bar: Indeterminate during Discovery, Percentage during Hashing */}
                    <div className="relative h-1.5 w-full bg-secondary rounded-full overflow-hidden">
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

            {/* Results */}
            {!scanning && duplicates.length > 0 && (
                <div className="flex-1 flex flex-col overflow-hidden">
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
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs font-bold gap-2"
                                onClick={() => selectDuplicates("all-but-newest")}
                            >
                                <CheckSquare className="w-4 h-4" />
                                Select All But One
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs font-bold gap-2 text-muted-foreground"
                                onClick={() => selectDuplicates("none")}
                            >
                                <Square className="w-4 h-4" />
                                Deselect All
                            </Button>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-xs font-bold text-muted-foreground">
                                {selectedPaths.size} selected
                            </span>
                            <Button
                                variant="destructive"
                                size="sm"
                                className="h-8 font-bold shadow-lg shadow-destructive/20"
                                disabled={selectedPaths.size === 0}
                                onClick={deleteSelected}
                            >
                                <Trash2 className="w-3.5 h-3.5 mr-2" />
                                Clean Files
                            </Button>
                        </div>
                    </div>

                    <ScrollArea className="flex-1">
                        <div className="p-6 space-y-6">
                            {duplicates.map((group, idx) => (
                                <div key={idx} className="bg-muted/10 border rounded-xl overflow-hidden shadow-sm">
                                    <div className="bg-muted/30 px-4 py-2 border-b flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className="p-1.5 bg-background rounded-md border shadow-sm">
                                                <FileText className="w-4 h-4 text-muted-foreground" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold truncate max-w-[300px]">
                                                    {group.paths[0].split(/[/\\]/).pop()}
                                                </div>
                                                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                                    {formatSize(group.size)} • {group.paths.length} Copies
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-[10px] font-mono text-muted-foreground/30 uppercase">
                                            Hash: {group.hash.slice(0, 8)}...
                                        </div>
                                    </div>
                                    <div className="p-2 space-y-1">
                                        {group.paths.map(path => (
                                            <div
                                                key={path}
                                                className={cn(
                                                    "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer group",
                                                    selectedPaths.has(path) ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-accent"
                                                )}
                                                onClick={() => toggleSelection(path)}
                                            >
                                                <Checkbox
                                                    checked={selectedPaths.has(path)}
                                                    onCheckedChange={(checked: boolean | "indeterminate") => {
                                                        if (typeof checked === "boolean") {
                                                            toggleSelection(path);
                                                        }
                                                    }}
                                                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                                    className="data-[state=checked]:bg-destructive data-[state=checked]:border-destructive"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-medium truncate group-hover:underline lowercase">{path}</div>
                                                </div>
                                                <div className="text-[10px] font-bold text-muted-foreground/40 uppercase group-hover:text-primary transition-colors">
                                                    {path.match(/[/\\]Users[/\\]/i) ? "User Space" : "System"}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>
            )}

            {!scanning && duplicates.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-12 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
                    <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
                        <CopyCheck className="w-12 h-12 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-bold mb-2">Ready to Scan</h3>
                    <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                        Select folders from the sidebar to start finding identical files and freeing up storage space.
                    </p>
                </div>
            )}
        </div>
    );
};

