import React from "react";
import { FileEntry } from "@/types/explorer";
import { File, Folder, Plus, ImageIcon, Video, Music, FileText, FileSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { useExplorerStore } from "@/stores/explorerStore";
import { Button } from "@/components/ui/button";
import { createDragGhost } from "@/lib/dragUtils";
import { isVideoExtension } from "@/lib/fileTypes";

function getRowIcon(entry: FileEntry) {
    if (entry.is_dir) return <Folder className="w-4 h-4 fill-current text-sky-500" />;
    const ext = entry.extension?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) return <ImageIcon className="w-4 h-4 text-blue-500" />;
    if (isVideoExtension(ext)) return <Video className="w-4 h-4 text-purple-500" />;
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext || '')) return <Music className="w-4 h-4 text-pink-500" />;
    if (['txt', 'md', 'js', 'ts', 'tsx', 'py', 'rs', 'json'].includes(ext || '')) return <FileText className="w-4 h-4 text-slate-500" />;
    if (['pdf'].includes(ext || '')) return <FileSearch className="w-4 h-4 text-red-500" />;
    return <File className="w-4 h-4 text-muted-foreground" />;
}

interface FileRowProps {
    entry: FileEntry;
    selected: boolean;
    isActive: boolean;
    onClick: (e: React.MouseEvent) => void;
    style: React.CSSProperties;
    onToggleSelect?: (e: React.MouseEvent) => void;
}

export const FileRow = React.memo(({ entry, selected, isActive, onClick, style, onToggleSelect }: FileRowProps) => {

    return (
        <div
            style={style}
            className={cn(
                "flex items-center px-4 py-1 cursor-default select-none border-b border-transparent hover:bg-accent/50",
                selected && "bg-accent text-accent-foreground",
                isActive && "border-l-2 border-l-primary"
            )}
            draggable
            onDragStart={(e) => {
                const { tabs, activeTabId } = useExplorerStore.getState();
                const tab = tabs.find(t => t.id === activeTabId);
                const selection = tab?.selection || new Set();

                let dragPaths = [entry.path];
                if (selection.has(entry.path)) {
                    dragPaths = Array.from(selection);
                }

                e.dataTransfer.setData("application/x-super-explorer-files", JSON.stringify(dragPaths));
                e.dataTransfer.effectAllowed = "copyMove";

                // Set a drag image
                const ghost = createDragGhost(dragPaths.length, dragPaths.length === 1 ? entry.name : "multiple items");
                e.dataTransfer.setDragImage(ghost, 0, 0);
            }}
            onClick={onClick}
            data-path={entry.path}
        >
            <div className="mr-3 shrink-0">
                {getRowIcon(entry)}
            </div>
            <div className="flex-1 truncate text-sm">
                {entry.name}
            </div>

            <div className="text-[10px] text-muted-foreground w-20 text-right mr-10 tabular-nums">
                {formatSize(entry.size)}
            </div>

            <div className="text-[10px] text-muted-foreground w-24 text-right mr-8 tabular-nums">
                {formatDate(entry.modified)}
            </div>

            <Button
                variant={selected ? "default" : "ghost"}
                size="icon"
                className={cn(
                    "h-6 w-6 transition-opacity shrink-0",
                    selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect?.(e);
                }}
            >
                {selected ? <Plus className="w-3 h-3 rotate-45" /> : <Plus className="w-3 h-3" />}
            </Button>
        </div>
    );
});

function formatDate(timestamp: number | null): string {
    if (!timestamp) return "";
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatSize(bytes: number | null): string {
    if (bytes === null) return "";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
