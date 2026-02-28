import React from "react";
import { FileEntry } from "@/types/explorer";
import {
    File, Folder, ImageIcon, Video, Music, FileText, FileSearch,
    Archive, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useExplorerStore } from "@/stores/explorerStore";
import { createDragGhost } from "@/lib/dragUtils";
import { isVideoExtension, isAudioExtension, isArchiveExtension } from "@/lib/fileTypes";
import { invoke } from "@tauri-apps/api/core";

// ── Icon + badge helpers ────────────────────────────────────────────────────

function getRowIcon(entry: FileEntry) {
    if (entry.is_dir) return (
        <div className="w-7 h-7 rounded-md bg-sky-500/10 flex items-center justify-center shrink-0">
            <Folder className="w-3.5 h-3.5 fill-sky-400/20 text-sky-500" />
        </div>
    );
    const ext = entry.extension?.toLowerCase() ?? "";
    if (["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "heic"].includes(ext))
        return <div className="w-7 h-7 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0"><ImageIcon className="w-3.5 h-3.5 text-blue-500" /></div>;
    if (isVideoExtension(ext))
        return <div className="w-7 h-7 rounded-md bg-purple-500/10 flex items-center justify-center shrink-0"><Video className="w-3.5 h-3.5 text-purple-500" /></div>;
    if (isAudioExtension(ext))
        return <div className="w-7 h-7 rounded-md bg-pink-500/10 flex items-center justify-center shrink-0"><Music className="w-3.5 h-3.5 text-pink-500" /></div>;
    if (["txt", "md", "js", "ts", "tsx", "jsx", "py", "rs", "go", "json", "yaml", "yml", "toml", "sh"].includes(ext))
        return <div className="w-7 h-7 rounded-md bg-slate-500/10 flex items-center justify-center shrink-0"><FileText className="w-3.5 h-3.5 text-slate-500" /></div>;
    if (ext === "pdf")
        return <div className="w-7 h-7 rounded-md bg-red-500/10 flex items-center justify-center shrink-0"><FileSearch className="w-3.5 h-3.5 text-red-500" /></div>;
    if (isArchiveExtension(ext))
        return <div className="w-7 h-7 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0"><Archive className="w-3.5 h-3.5 text-amber-500" /></div>;
    return <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0"><File className="w-3.5 h-3.5 text-muted-foreground" /></div>;
}

function ExtBadge({ ext }: { ext: string }) {
    if (!ext || ext === ".") return null;
    const clean = ext.replace(/^\./, "").toUpperCase();
    return (
        <span className="shrink-0 px-1 py-0.5 rounded text-[9px] font-bold bg-muted text-muted-foreground tracking-wide">
            {clean}
        </span>
    );
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function humanDate(timestamp: number | null): string {
    if (!timestamp) return "";
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: diffDays > 365 ? "numeric" : undefined });
}

function formatSize(bytes: number | null): string {
    if (bytes === null || bytes === 0) return "";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let ui = 0;
    while (size >= 1024 && ui < units.length - 1) { size /= 1024; ui++; }
    return `${size.toFixed(ui === 0 ? 0 : 1)} ${units[ui]}`;
}

// ── Component ────────────────────────────────────────────────────────────────

interface FileRowProps {
    entry: FileEntry;
    selected: boolean;
    isActive: boolean;
    onClick: (e: React.MouseEvent) => void;
    style: React.CSSProperties;
    onToggleSelect?: (e: React.MouseEvent) => void;
}

export const FileRow = React.memo(({ entry, selected, isActive: _isActive, onClick, style, onToggleSelect }: FileRowProps) => {
    const [isDragOver, setIsDragOver] = React.useState(false);
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

    const ext = entry.extension ?? "";

    return (
        <div
            style={style}
            className={cn(
                "group flex items-center gap-2 px-3 py-0 cursor-default select-none border-b border-transparent transition-all duration-100",
                // Left accent for active/selected
                "border-l-2",
                selected
                    ? "bg-primary/5 border-l-primary text-foreground"
                    : "border-l-transparent hover:bg-accent/40 hover:border-l-border",
                isDragOver && "bg-primary/10 border-l-primary ring-1 ring-inset ring-primary/40"
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
            {/* Checkbox — animated in when selected or on group hover */}
            <button
                className={cn(
                    "shrink-0 w-5 h-5 rounded flex items-center justify-center transition-all duration-150",
                    selected
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-transparent border border-muted-foreground/20 opacity-0 group-hover:opacity-100 text-muted-foreground hover:border-primary/60"
                )}
                onClick={(e) => { e.stopPropagation(); onToggleSelect?.(e); }}
                tabIndex={-1}
            >
                {selected && <Check className="w-2.5 h-2.5" />}
            </button>

            {/* File type icon */}
            {getRowIcon(entry)}

            {/* Name + ext badge */}
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
                <span className="truncate text-[13px] font-medium leading-none">
                    {entry.name}
                </span>
                {!entry.is_dir && <ExtBadge ext={ext} />}
            </div>

            {/* Size */}
            <div className="text-[11px] text-muted-foreground w-16 text-right shrink-0 tabular-nums">
                {formatSize(entry.size)}
            </div>

            {/* Modified */}
            <div className="text-[11px] text-muted-foreground w-20 text-right shrink-0 mr-1">
                {humanDate(entry.modified)}
            </div>
        </div>
    );
});
