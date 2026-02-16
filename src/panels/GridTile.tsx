import { FileEntry } from "@/types/explorer";
import { cn } from "@/lib/utils";
import { File, Folder, ImageIcon, Video, Music, FileText, FileSearch, Plus } from "lucide-react";
import { useExplorerStore } from "@/stores/explorerStore";
import { Button } from "@/components/ui/button";
import { createDragGhost } from "@/lib/dragUtils";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface GridTileProps {
    entry: FileEntry;
    selected: boolean;
    isActive: boolean;
    onClick: (e: React.MouseEvent) => void;
    style?: React.CSSProperties;
    onToggleSelect?: (e: React.MouseEvent) => void;
}

export const GridTile = ({ entry, selected, isActive, onClick, style, onToggleSelect }: GridTileProps) => {
    const [thumbnail, setThumbnail] = useState<string | null>(null);

    useEffect(() => {
        if (!entry.is_dir && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(entry.extension?.toLowerCase() || '')) {
            invoke<string>("get_thumbnail", { path: entry.path, width: 128, height: 128 })
                .then(setThumbnail)
                .catch(() => { }); // SILENT error for thumbnails
        }
    }, [entry.path, entry.extension, entry.is_dir]);
    const getIcon = () => {
        if (entry.is_dir) return <Folder className="w-10 h-10 text-primary/60" />;

        const ext = entry.extension?.toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) return <ImageIcon className="w-10 h-10 text-blue-500/60" />;
        if (['mp4', 'webm', 'mov', 'mkv'].includes(ext || '')) return <Video className="w-10 h-10 text-purple-500/60" />;
        if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext || '')) return <Music className="w-10 h-10 text-pink-500/60" />;
        if (['txt', 'md', 'js', 'ts', 'tsx', 'py'].includes(ext || '')) return <FileText className="w-10 h-10 text-slate-500/60" />;
        if (['pdf'].includes(ext || '')) return <FileSearch className="w-10 h-10 text-red-500/60" />;

        return <File className="w-10 h-10 text-muted-foreground/60" />;
    };

    return (
        <div
            style={style}
            className={cn(
                "group flex flex-col items-center justify-start gap-3 p-3 rounded-xl cursor-pointer transition-all border bg-card hover:bg-accent/50 hover:shadow-md hover:-translate-y-0.5 active:scale-95",
                selected ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20" : "border-border/50",
                isActive && selected && "border-primary bg-primary/10",
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
            <Button
                variant={selected ? "default" : "secondary"}
                size="icon"
                className={cn(
                    "absolute top-1 left-1 h-5 w-5 rounded-full transition-opacity z-10 shadow-sm",
                    selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect?.(e);
                }}
            >
                {selected ? <Plus className="w-3 h-3 rotate-45" /> : <Plus className="w-3 h-3" />}
            </Button>

            <div className="relative w-28 h-28 flex items-center justify-center overflow-hidden rounded-md transition-all group-hover:shadow-md bg-muted/20">
                {thumbnail ? (
                    <img src={thumbnail} className="w-full h-full object-cover" alt="" />
                ) : getIcon()}
                {/* Selection indicator */}
                {selected && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full border-2 border-background flex items-center justify-center shadow-sm z-10" />
                )}
            </div>
            <span className="text-[10px] text-center font-medium truncate w-full px-1 text-muted-foreground group-hover:text-foreground">
                {entry.name}
            </span>
        </div>
    );
};
