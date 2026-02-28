import React, { useMemo } from "react";
import { useExplorerStore } from "@/stores/explorerStore";
import { useSidebarStore } from "@/stores/sidebarStore";
import { FilePreviewContent } from "./FilePreviewContent";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
    Info,
    FileText,
    Clock,
    HardDrive,
    ExternalLink,
    Folder,
    Trash2,
    Edit3,
    Eye,
    Search
} from "lucide-react";
import { Button } from "./ui/button";

export const InspectorSidebar = () => {
    const isRightSidebarOpen = useSidebarStore(s => s.isRightSidebarOpen);
    const activeTabId = useExplorerStore(s => s.activeTabId);
    const activeTab = useExplorerStore(s => s.tabs.find(t => t.id === activeTabId));

    const selection = activeTab?.selection || new Set<string>();
    const lastSelectedPath = activeTab?.lastSelectedPath;
    const selectedEntry = useMemo(() => {
        if (!activeTab || !lastSelectedPath) return null;
        return activeTab.entries.find(e => e.path === lastSelectedPath);
    }, [activeTab, lastSelectedPath]);

    const selectionCount = selection.size;

    return (
        <AnimatePresence>
            {isRightSidebarOpen && (
                <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 320, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="h-full bg-muted/5 border-l flex flex-col overflow-hidden select-none relative z-20"
                >
                    <div className="w-80 h-full flex flex-col">
                        <div className="px-4 py-3 border-b bg-muted/10 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Info className="w-3.5 h-3.5 text-primary" />
                                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Inspector</span>
                            </div>
                            {selectionCount > 0 && (
                                <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                                    {selectionCount} selected
                                </span>
                            )}
                        </div>

                        <ScrollArea className="flex-1">
                            <div className="p-4 space-y-6">
                                {selectionCount === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 opacity-40">
                                        <div className="w-16 h-16 rounded-3xl bg-muted flex items-center justify-center border-2 border-dashed border-muted-foreground/30">
                                            <Search className="w-8 h-8 text-muted-foreground" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium">Nothing Selected</p>
                                            <p className="text-[10px] max-w-[180px]">Select a file or folder to view its details and properties here.</p>
                                        </div>
                                    </div>
                                ) : selectionCount === 1 && selectedEntry ? (
                                    <div className="space-y-6">
                                        {/* Dynamic Preview Card */}
                                        <div className="relative group">
                                            <div className="aspect-square w-full rounded-2xl bg-muted/20 border border-border/50 overflow-hidden flex items-center justify-center shadow-inner group-hover:border-primary/30 transition-colors">
                                                <FilePreviewContent
                                                    path={selectedEntry.path}
                                                    extension={selectedEntry.extension || ""}
                                                    name={selectedEntry.name}
                                                    is_dir={selectedEntry.is_dir}
                                                    section="explorer"
                                                    className="w-full h-full object-contain"
                                                />
                                            </div>
                                            {!selectedEntry.is_dir && (
                                                <Button
                                                    variant="secondary"
                                                    size="icon"
                                                    className="absolute bottom-2 right-2 h-7 w-7 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={() => {/* Open specialized preview */ }}
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                </Button>
                                            )}
                                        </div>

                                        {/* Metadata Details */}
                                        <div className="space-y-4">
                                            <div className="space-y-1">
                                                <h2 className="text-sm font-bold tracking-tight text-foreground break-all leading-tight">
                                                    {selectedEntry.name}
                                                </h2>
                                                <p className="text-[10px] text-muted-foreground font-mono truncate opacity-60">
                                                    {selectedEntry.path}
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <MetaItem
                                                    icon={<HardDrive className="w-3 h-3" />}
                                                    label="Size"
                                                    value={formatSize(selectedEntry.size)}
                                                />
                                                <MetaItem
                                                    icon={<FileText className="w-3 h-3" />}
                                                    label="Type"
                                                    value={selectedEntry.is_dir ? "Folder" : (selectedEntry.extension?.toUpperCase() || "File")}
                                                />
                                                <MetaItem
                                                    icon={<Clock className="w-3 h-3" />}
                                                    label="Modified"
                                                    value={formatDate(selectedEntry.modified)}
                                                    span={2}
                                                />
                                            </div>
                                        </div>

                                        {/* Quick Actions */}
                                        <div className="space-y-2 pt-2 border-t border-border/40">
                                            <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground/60 px-1">Quick Actions</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <ActionButton icon={<ExternalLink className="w-3.5 h-3.5" />} label="Open" />
                                                <ActionButton icon={<Edit3 className="w-3.5 h-3.5" />} label="Rename" />
                                                <ActionButton icon={<Trash2 className="w-3.5 h-3.5" />} label="Delete" variant="destructive" />
                                                <ActionButton icon={<Folder className="w-3.5 h-3.5" />} label="Reveal" />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="aspect-square w-full rounded-2xl bg-primary/5 border border-primary/20 flex flex-col items-center justify-center gap-4 text-primary">
                                            <div className="relative">
                                                <Files className="w-16 h-16 opacity-20" />
                                                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl font-black">{selectionCount}</span>
                                            </div>
                                            <p className="text-xs font-bold uppercase tracking-wider">Multiple Items</p>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="p-3 rounded-xl bg-muted/20 border border-border/50 space-y-2">
                                                <div className="flex justify-between text-[10px]">
                                                    <span className="text-muted-foreground font-bold uppercase">Total Files</span>
                                                    <span className="font-mono">{selectionCount}</span>
                                                </div>
                                                <div className="flex justify-between text-[10px]">
                                                    <span className="text-muted-foreground font-bold uppercase">Total Size</span>
                                                    <span className="font-mono">{formatSize(calculateTotalSize(activeTab?.entries, selection))}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

const MetaItem = ({ icon, label, value, span = 1 }: { icon: React.ReactNode, label: string, value: string, span?: number }) => (
    <div className={cn("p-2.5 rounded-xl bg-muted/20 border border-border/30 flex flex-col gap-1", span === 2 ? "col-span-2" : "col-span-1")}>
        <div className="flex items-center gap-1.5 text-muted-foreground">
            {icon}
            <span className="text-[9px] uppercase font-black tracking-widest">{label}</span>
        </div>
        <span className="text-xs font-bold text-foreground truncate tabular-nums">{value}</span>
    </div>
);

const ActionButton = ({ icon, label, variant = "ghost" }: { icon: React.ReactNode, label: string, variant?: "ghost" | "destructive" | "secondary" }) => (
    <Button
        variant={variant === "destructive" ? "outline" : variant}
        size="sm"
        className={cn(
            "h-8 gap-2 text-[11px] justify-start px-2 font-bold",
            variant === "destructive" && "text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
        )}
    >
        {icon}
        {label}
    </Button>
);

// --- Utils ---

function formatSize(bytes: number | null | undefined): string {
    if (bytes == null) return "--";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let i = 0;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(ts: number | string | null | undefined): string {
    if (ts == null) return "--";
    try {
        const d = new Date(typeof ts === "number" ? ts * 1000 : ts);
        return d.toLocaleString(undefined, {
            month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit"
        });
    } catch { return "--"; }
}

function calculateTotalSize(entries: any[] | undefined, selection: Set<string>): number {
    if (!entries) return 0;
    return entries.filter(e => selection.has(e.path)).reduce((sum, e) => sum + (e.size || 0), 0);
}

const Files = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M15.5 2H8.6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h10.8c1.1 0 2-.9 2-2V7.5L15.5 2z" />
        <path d="M15.5 2v5.5h5.5" />
        <path d="M2.2 6v16c0 1.1.9 2 2 2H11" />
    </svg>
);
