import { FileEntry } from "@/types/explorer";
import { cn } from "@/lib/utils";
import { File, Folder, ImageIcon, Video, Music, FileText, FileSearch, Plus } from "lucide-react";
import { useExplorerStore } from "@/stores/explorerStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { Button } from "@/components/ui/button";
import { createDragGhost } from "@/lib/dragUtils";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isVideoExtension } from "@/lib/fileTypes";

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
    const gridWidth = useSettingsStore((s) => s.grid_thumbnail_width);
    const gridHeight = useSettingsStore((s) => s.grid_thumbnail_height);
    const [isDragOver, setIsDragOver] = useState(false);
    const refresh = useExplorerStore(state => state.refresh);
    const activeTabId = useExplorerStore(state => state.activeTabId);

    const handleDragOver = (e: React.DragEvent) => {
        if (!entry.is_dir) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
        e.dataTransfer.dropEffect = "move";
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        if (!entry.is_dir) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        const filesData = e.dataTransfer.getData("application/x-super-explorer-files");
        if (!filesData) return;

        try {
            const sources: string[] = JSON.parse(filesData);
            if (sources.length === 0) return;

            // Don't drop into self or subfolders
            if (sources.some(src => entry.path === src || entry.path.startsWith(src + "/"))) return;

            await invoke("batch_move", {
                operationId: crypto.randomUUID(),
                sources,
                destinationDir: entry.path
            });
            if (activeTabId) refresh(activeTabId);
        } catch (err) {
            console.error("Drop failed:", err);
        }
    };

    const isImage = !entry.is_dir && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(entry.extension?.toLowerCase() || '');
    const isVideo = !entry.is_dir && isVideoExtension(entry.extension);

    useEffect(() => {
        if (isImage) {
            invoke<string>("get_thumbnail", { path: entry.path, width: gridWidth, height: gridHeight })
                .then(setThumbnail)
                .catch(() => { });
        } else if (isVideo) {
            invoke<string>("get_video_thumbnail", { path: entry.path, width: gridWidth, height: gridHeight })
                .then(setThumbnail)
                .catch(() => { });
        }
    }, [entry.path, entry.extension, entry.is_dir, isImage, isVideo, gridWidth, gridHeight]);

    const getIcon = () => {
        if (entry.is_dir) return <Folder className="w-16 h-16 text-sky-500" />;

        const ext = entry.extension?.toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) return <ImageIcon className="w-16 h-16 text-blue-500/60" />;
        if (isVideoExtension(ext)) return <Video className="w-16 h-16 text-purple-500/60" />;
        if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext || '')) return <Music className="w-16 h-16 text-pink-500/60" />;
        if (['txt', 'md', 'js', 'ts', 'tsx', 'py'].includes(ext || '')) return <FileText className="w-16 h-16 text-slate-500/60" />;
        if (['pdf'].includes(ext || '')) return <FileSearch className="w-16 h-16 text-red-500/60" />;

        return <File className="w-16 h-16 text-muted-foreground/60" />;
    };

    return (
        <div
            style={style}
            className={cn(
                "group flex flex-col items-center justify-start gap-3 p-3 rounded-xl cursor-pointer transition-all border bg-card hover:bg-accent/50 hover:shadow-md hover:-translate-y-0.5 active:scale-95",
                selected ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20" : "border-border/50",
                isActive && selected && "border-primary bg-primary/10",
                isDragOver && "bg-primary/20 ring-2 ring-primary border-primary"
            )}
            draggable
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
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

            <div
                className="relative flex items-center justify-center overflow-hidden rounded-md transition-all group-hover:shadow-md bg-muted/20 shrink-0"
                style={{ width: gridWidth, height: gridHeight, minWidth: gridWidth, minHeight: gridHeight }}
            >
                {thumbnail ? (
                    <img src={thumbnail} className="w-full h-full object-cover" alt="" />
                ) : (
                    getIcon()
                )}
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
