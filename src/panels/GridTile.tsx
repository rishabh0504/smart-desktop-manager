import { FileEntry } from "@/types/explorer";
import { cn } from "@/lib/utils";
import { File, Folder, ImageIcon, Video, Music, FileText, FileSearch, Archive, Check } from "lucide-react";
import { useExplorerStore } from "@/stores/explorerStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { createDragGhost } from "@/lib/dragUtils";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isVideoExtension, isAudioExtension, isArchiveExtension } from "@/lib/fileTypes";

interface GridTileProps {
    entry: FileEntry;
    selected: boolean;
    isActive: boolean;
    onClick: (e: React.MouseEvent) => void;
    style?: React.CSSProperties;
    onToggleSelect?: (e: React.MouseEvent) => void;
}

function getIconFallback(entry: FileEntry) {
    if (entry.is_dir) return <Folder className="w-12 h-12 text-sky-500 fill-sky-400/30" />;
    const ext = entry.extension?.toLowerCase() ?? "";
    if (["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "heic"].includes(ext))
        return <ImageIcon className="w-12 h-12 text-blue-500/70" />;
    if (isVideoExtension(ext)) return <Video className="w-12 h-12 text-purple-500/70" />;
    if (isAudioExtension(ext)) return <Music className="w-12 h-12 text-pink-500/70" />;
    if (["txt", "md", "js", "ts", "tsx", "jsx", "py", "rs", "go", "json"].includes(ext))
        return <FileText className="w-12 h-12 text-slate-500/70" />;
    if (ext === "pdf") return <FileSearch className="w-12 h-12 text-red-500/70" />;
    if (isArchiveExtension(ext)) return <Archive className="w-12 h-12 text-amber-500/70" />;
    return <File className="w-12 h-12 text-muted-foreground/50" />;
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

    const handleDragLeave = () => setIsDragOver(false);

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
            if (sources.some(src => entry.path === src || entry.path.startsWith(src + "/"))) return;
            await invoke("batch_move", { operationId: crypto.randomUUID(), sources, destinationDir: entry.path });
            if (activeTabId) refresh(activeTabId);
        } catch (err) { console.error("Drop failed:", err); }
    };

    const isImage = !entry.is_dir && ["jpg", "jpeg", "png", "gif", "webp"].includes(entry.extension?.toLowerCase() || "");
    const isVideo = !entry.is_dir && isVideoExtension(entry.extension);

    useEffect(() => {
        if (isImage) {
            invoke<string>("get_thumbnail", { path: entry.path, width: gridWidth, height: gridHeight })
                .then(setThumbnail).catch(() => { });
        } else if (isVideo) {
            invoke<string>("get_video_thumbnail", { path: entry.path, width: gridWidth, height: gridHeight })
                .then(setThumbnail).catch(() => { });
        }
    }, [entry.path, entry.extension, entry.is_dir, isImage, isVideo, gridWidth, gridHeight]);

    return (
        <div
            style={style}
            className={cn(
                "group relative flex flex-col items-center gap-2 p-2.5 rounded-xl cursor-pointer select-none transition-all duration-150",
                "border bg-card hover:bg-accent/30 hover:shadow-lg hover:-translate-y-0.5",
                selected
                    ? "border-primary/60 bg-primary/5 ring-2 ring-primary/20 shadow-md"
                    : "border-border/50 hover:border-border",
                isActive && selected && "ring-primary/40",
                isDragOver && "bg-primary/10 ring-2 ring-primary border-primary"
            )}
            draggable
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragStart={(e) => {
                const { tabs, activeTabId } = useExplorerStore.getState();
                const tab = tabs.find(t => t.id === activeTabId);
                const sel = tab?.selection || new Set();
                const dragPaths = sel.has(entry.path) ? Array.from(sel) : [entry.path];
                e.dataTransfer.setData("application/x-super-explorer-files", JSON.stringify(dragPaths));
                e.dataTransfer.effectAllowed = "copyMove";
                const ghost = createDragGhost(dragPaths.length, dragPaths.length === 1 ? entry.name : "multiple items");
                e.dataTransfer.setDragImage(ghost, 0, 0);
            }}
            onClick={onClick}
            data-path={entry.path}
        >
            {/* Selection checkbox — top-left */}
            <button
                className={cn(
                    "absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-150 shadow-sm",
                    selected
                        ? "bg-primary text-primary-foreground scale-100 opacity-100"
                        : "bg-background/80 border border-muted-foreground/30 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100"
                )}
                onClick={(e) => { e.stopPropagation(); onToggleSelect?.(e); }}
                tabIndex={-1}
            >
                {selected && <Check className="w-2.5 h-2.5" />}
            </button>

            {/* Thumbnail / icon */}
            <div
                className={cn(
                    "relative flex items-center justify-center overflow-hidden rounded-lg transition-all bg-muted/20 shrink-0",
                    "group-hover:shadow-inner"
                )}
                style={{ width: gridWidth, height: gridHeight, minWidth: gridWidth, minHeight: gridHeight }}
            >
                {thumbnail ? (
                    <img src={thumbnail} className="w-full h-full object-cover" alt="" />
                ) : (
                    getIconFallback(entry)
                )}
                {/* Selected overlay */}
                {selected && (
                    <div className="absolute inset-0 bg-primary/10 rounded-lg" />
                )}
            </div>

            {/* Name — 2-line clamp */}
            <span
                className="text-[11px] text-center font-medium leading-snug line-clamp-2 w-full px-0.5 text-muted-foreground group-hover:text-foreground transition-colors"
                title={entry.name}
            >
                {entry.name}
            </span>
        </div>
    );
};
