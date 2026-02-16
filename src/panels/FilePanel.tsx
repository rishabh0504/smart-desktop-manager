import { useRef, useEffect, useCallback, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useExplorerStore } from "@/stores/explorerStore";
import { usePreviewStore } from "@/stores/previewStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { FileEntry } from "@/types/explorer";
import { GridTile } from "./GridTile";
import { FileRow } from "./FileRow";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { FileContextMenu } from "@/components/FileContextMenu";
import { cn } from "@/lib/utils";
import {
    LayoutList,
    LayoutGrid,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    ArrowUpDown,
    ChevronUp,
    ChevronDown,
    Trash2,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface FilePanelProps {
    tabId: string;
}

export const FilePanel = ({ tabId }: FilePanelProps) => {
    const tab = useExplorerStore((state) => state.tabs.find((t) => t.id === tabId));
    const activeTabId = useExplorerStore((state) => state.activeTabId);

    const setActiveTab = useExplorerStore((state) => state.setActiveTab);
    const setViewMode = useExplorerStore((state) => state.setViewMode);
    const goBack = useExplorerStore((state) => state.goBack);
    const goForward = useExplorerStore((state) => state.goForward);
    const goParent = useExplorerStore((state) => state.goParent);
    const toggleSort = useExplorerStore((state) => state.toggleSort);
    const handleSelection = useExplorerStore((state) => state.handleSelection);
    const clearSelection = useExplorerStore((state) => state.clearSelection);
    const refresh = useExplorerStore((state) => state.refresh);
    const toggleSelection = useExplorerStore((state) => state.toggleSelection);
    const setPath = useExplorerStore((state) => state.setPath);
    const { openPreview } = usePreviewStore();
    const { settings } = useSettingsStore();

    const parentRef = useRef<HTMLDivElement>(null);
    const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number; startX: number; startY: number } | null>(null);

    // Don't render until tab exists and has a path
    if (!tab || !tab.path) return null;

    const isGrid = tab.viewMode === "grid";
    const isActive = activeTabId === tab.id;

    const rowVirtualizer = useVirtualizer({
        count: tab.entries.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 36,
        overscan: 20,
        enabled: !isGrid,
    });

    useEffect(() => rowVirtualizer.measure(), [tab.entries, tab.viewMode]);

    const onItemClick = useCallback(
        (entry: FileEntry, e: React.MouseEvent) => {
            e.stopPropagation();
            setActiveTab(tab.id);

            const isCmd = e.ctrlKey || e.metaKey;
            const isShift = e.shiftKey;

            if (isCmd || isShift) {
                handleSelection(tab.id, entry.path, isCmd, isShift);
                return;
            }

            // Normal click without modifiers: OPEN or PREVIEW
            if (entry.is_dir) {
                setPath(tab.id, entry.path);
            } else {
                const type = getFileType(entry.extension ?? undefined);
                const meaningfulTypes = ["image", "video", "audio", "text", "pdf", "code"];
                if (!meaningfulTypes.includes(type)) {
                    // Just select if not previewable
                    handleSelection(tab.id, entry.path, false, false);
                    return;
                }

                const enabled = settings.preview_enabled?.[type as keyof typeof settings.preview_enabled] ?? true;
                if (enabled) {
                    openPreview({ ...entry, path: entry.canonical_path });
                } else {
                    handleSelection(tab.id, entry.path, false, false);
                }
            }
        },
        [tab.id, setActiveTab, handleSelection, setPath, openPreview, settings]
    );

    const handleDelete = useCallback(async (paths?: string[]) => {
        const pathsToDelete = paths || Array.from(tab.selection);
        if (pathsToDelete.length === 0) return;

        const message = pathsToDelete.length === 1
            ? `Are you sure you want to delete "${pathsToDelete[0].split(/[/\\]/).pop()}"?`
            : `Are you sure you want to delete ${pathsToDelete.length} items?`;

        const confirm = await window.confirm(message);
        if (!confirm) return;

        try {
            const operationId = crypto.randomUUID();
            await invoke("delete_items", { operationId, paths: pathsToDelete });
            refresh(tab.id);
        } catch (err) {
            console.error("Delete failed:", err);
        }
    }, [tab.id, tab.selection, refresh]);

    // Navigation key handler
    useEffect(() => {
        const handleKeys = (e: KeyboardEvent) => {
            if (!isActive || !tab.entries.length) return;
            const target = e.target as HTMLElement;
            if (["INPUT", "TEXTAREA"].includes(target.tagName)) return;

            const isCmd = e.metaKey || e.ctrlKey;
            const isShift = e.shiftKey;

            switch (e.key) {
                case "ArrowDown":
                case "ArrowUp": {
                    e.preventDefault();
                    let nextIdx = 0;
                    if (tab.lastSelectedPath) {
                        const currentIdx = tab.entries.findIndex(entry => entry.path === tab.lastSelectedPath);
                        if (e.key === "ArrowDown") {
                            nextIdx = Math.min(currentIdx + 1, tab.entries.length - 1);
                        } else {
                            nextIdx = Math.max(currentIdx - 1, 0);
                        }
                    } else {
                        nextIdx = e.key === "ArrowDown" ? 0 : tab.entries.length - 1;
                    }

                    const nextEntry = tab.entries[nextIdx];
                    if (nextEntry) {
                        handleSelection(tab.id, nextEntry.path, isCmd, isShift);
                        // Ensure it's scrolled into view if needed
                        // rowVirtualizer.scrollToIndex(nextIdx); // Optional: add if desired
                    }
                    break;
                }
                case "Enter": {
                    e.preventDefault();
                    const firstSelected = tab.entries.find(entry => tab.selection.has(entry.path));
                    if (firstSelected && firstSelected.is_dir) {
                        setPath(tab.id, firstSelected.path);
                    }
                    break;
                }
                case "Backspace":
                case "Delete": {
                    // Cmd+Backspace on Mac or Delete on all
                    if (e.key === "Delete" || (isCmd && e.key === "Backspace")) {
                        e.preventDefault();
                        handleDelete();
                    }
                    break;
                }
                case " ": {
                    e.preventDefault();
                    const firstSelected = tab.entries.find(entry => tab.selection.has(entry.path));
                    if (firstSelected && !firstSelected.is_dir) {
                        const type = getFileType(firstSelected.extension ?? undefined);
                        const meaningfulTypes = ["image", "video", "audio", "text", "pdf", "code"];
                        if (meaningfulTypes.includes(type)) {
                            openPreview({ ...firstSelected, path: firstSelected.canonical_path });
                        }
                    }
                    break;
                }
            }
        };

        window.addEventListener("keydown", handleKeys);
        return () => window.removeEventListener("keydown", handleKeys);
    }, [isActive, tab.id, tab.entries, tab.selection, tab.lastSelectedPath, handleSelection, setPath, openPreview]);



    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();

        const filesData = e.dataTransfer.getData("application/x-super-explorer-files");
        const singleFileData = e.dataTransfer.getData("application/x-super-explorer-file");

        let sources: string[] = [];
        if (filesData) {
            sources = JSON.parse(filesData);
        } else if (singleFileData) {
            const entry: FileEntry = JSON.parse(singleFileData);
            sources = [entry.path];
        }

        if (sources.length === 0) return;

        // Don't drop into self or subfolders
        if (sources.some(src => tab.path === src || tab.path.startsWith(src + "/"))) return;

        const operationId = crypto.randomUUID();
        const isCopy = e.altKey || (e.ctrlKey && !e.metaKey); // Shift-drag usually moves, Alt-drag copies
        const command = isCopy ? "batch_copy" : "batch_move";

        try {
            await invoke(command, {
                operationId,
                sources,
                destinationDir: tab.path
            });
            refresh(tab.id);
        } catch (err) {
            console.error(`${command} failed:`, err);
        }
    };

    const onMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only left click
        const container = parentRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const startX = e.clientX - rect.left + container.scrollLeft;
        const startY = e.clientY - rect.top + container.scrollTop;

        setSelectionRect({
            startX,
            startY,
            x: startX,
            y: startY,
            width: 0,
            height: 0
        });

        if (!e.metaKey && !e.ctrlKey) {
            clearSelection(tab.id);
        }
    };

    const onMouseMove = (e: React.MouseEvent) => {
        if (!selectionRect || !parentRef.current) return;

        const container = parentRef.current;
        const rect = container.getBoundingClientRect();
        const curX = e.clientX - rect.left + container.scrollLeft;
        const curY = e.clientY - rect.top + container.scrollTop;

        const x = Math.min(selectionRect.startX, curX);
        const y = Math.min(selectionRect.startY, curY);
        const width = Math.abs(selectionRect.startX - curX);
        const height = Math.abs(selectionRect.startY - curY);

        setSelectionRect({ ...selectionRect, x, y, width, height });

        // Collision detection
        const selectedInRect = new Set<string>();
        const itemElements = container.querySelectorAll("[data-path]");

        itemElements.forEach((el) => {
            const item = el as HTMLElement;
            const itemRect = {
                top: item.offsetTop,
                left: item.offsetLeft,
                bottom: item.offsetTop + item.offsetHeight,
                right: item.offsetLeft + item.offsetWidth,
            };

            const intersects = !(
                itemRect.left > x + width ||
                itemRect.right < x ||
                itemRect.top > y + height ||
                itemRect.bottom < y
            );

            if (intersects) {
                const path = item.getAttribute("data-path");
                if (path) selectedInRect.add(path);
            }
        });

        // We don't want to spam the store on every pixel, maybe throttle or use local state
        // For now, let's keep it simple and just update if different.
        // Actually, professional UX updates the selection VISUALLY first then commits on mouseUp.
        // But for this project, let's just use handleSelection for each item that enters.
        selectedInRect.forEach(path => {
            if (!tab.selection.has(path)) {
                handleSelection(tab.id, path, true, false); // use isCmd=true to append
            }
        });
    };

    const onMouseUp = () => {
        setSelectionRect(null);
    };

    return (
        <div
            className={cn(
                "flex flex-col h-full bg-background border rounded-md overflow-hidden",
                isActive ? "ring-1 ring-primary/20 border-primary/30" : "border-border"
            )}
            onClick={() => setActiveTab(tab.id)}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? "copy" : "move"; }}
            onDrop={handleDrop}
        >
            {/* Toolbar */}
            <div className="bg-muted/50 px-3 py-1.5 border-b flex justify-between items-center">
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground/70 tracking-tight">
                    <Button variant="ghost" size="icon" className="h-5 w-5" disabled={tab.currentIndex <= 0} onClick={(e) => { e.stopPropagation(); goBack(tab.id); }}>
                        <ArrowLeft className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" disabled={tab.currentIndex >= tab.history.length - 1} onClick={(e) => { e.stopPropagation(); goForward(tab.id); }}>
                        <ArrowRight className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); goParent(tab.id); }}>
                        <ArrowUp className="w-3 h-3" />
                    </Button>
                </div>

                <Breadcrumbs tabId={tab.id} />

                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                        title="Delete selected"
                        disabled={tab.selection.size === 0}
                    >
                        <Trash2 className="w-3 h-3" />
                    </Button>
                    <div className="w-px h-3 bg-border mx-1" />
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); setViewMode(tab.id, "list"); }}>
                        <LayoutList className={cn("w-3 h-3", tab.viewMode === "list" ? "text-primary" : "opacity-40")} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); setViewMode(tab.id, "grid"); }}>
                        <LayoutGrid className={cn("w-3 h-3", tab.viewMode === "grid" ? "text-primary" : "opacity-40")} />
                    </Button>
                </div>
            </div>

            {/* List headers */}
            {tab.viewMode === "list" && (
                <div className="flex items-center px-4 py-1.5 border-b bg-muted/20 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 select-none">
                    <div className="flex-1 flex items-center gap-1 cursor-pointer" onClick={() => toggleSort(tab.id, "name")}>
                        Name {tab.sortBy === "name" ? (tab.order === "asc" ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />) : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
                    </div>
                    <div className="w-20 text-right cursor-pointer mr-10" onClick={() => toggleSort(tab.id, "size")}>
                        Size {tab.sortBy === "size" ? (tab.order === "asc" ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />) : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
                    </div>
                    <div className="w-24 text-right cursor-pointer mr-8" onClick={() => toggleSort(tab.id, "modified")}>
                        Modified {tab.sortBy === "modified" ? (tab.order === "asc" ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />) : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
                    </div>
                </div>
            )}

            {/* File content */}
            <div
                ref={parentRef}
                className="flex-1 overflow-auto outline-none relative"
                tabIndex={0}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
            >
                {tab.loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-50">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                )}

                {!tab.loading && tab.entries.length === 0 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-background">
                        <span className="text-4xl mb-2">📂</span>
                        <p className="text-sm font-medium">Folder is empty</p>
                    </div>
                )}

                {selectionRect && (
                    <div
                        className="absolute bg-primary/20 border border-primary/50 pointer-events-none z-50 rounded-sm"
                        style={{
                            left: selectionRect.x,
                            top: selectionRect.y,
                            width: selectionRect.width,
                            height: selectionRect.height,
                        }}
                    />
                )}
                {isGrid ? (
                    <div className="grid gap-4 p-4 grid-cols-[repeat(auto-fill,minmax(120px,1fr))]">
                        {tab.entries.map((entry) => (
                            <FileContextMenu key={entry.path} entry={entry} tabId={tab.id}>
                                <GridTile
                                    entry={entry}
                                    selected={tab.selection.has(entry.path)}
                                    isActive={isActive}
                                    onClick={(e) => onItemClick(entry, e)}
                                    onToggleSelect={() => toggleSelection(tab.id, entry.path)}
                                />
                            </FileContextMenu>
                        ))}
                    </div>
                ) : (
                    <div style={{ height: rowVirtualizer.getTotalSize(), width: "100%", position: "relative" }}>
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const entry = tab.entries[virtualRow.index];
                            if (!entry) return null;

                            return (
                                <div
                                    key={entry.path}
                                    style={{
                                        position: "absolute",
                                        top: 0,
                                        left: 0,
                                        width: "100%",
                                        height: virtualRow.size,
                                        transform: `translateY(${virtualRow.start}px)`,
                                    }}
                                >
                                    <FileContextMenu entry={entry} tabId={tab.id}>
                                        <FileRow
                                            entry={entry}
                                            selected={tab.selection.has(entry.path)}
                                            isActive={isActive}
                                            onClick={(e) => onItemClick(entry, e)}
                                            onToggleSelect={() => toggleSelection(tab.id, entry.path)}
                                            style={{ width: "100%", height: virtualRow.size }}
                                        />
                                    </FileContextMenu>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

// Utility: file type detection
function getFileType(ext?: string): string {
    if (!ext) return "other";
    const e = ext.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(e)) return "image";
    if (["mp4", "webm", "mov", "mkv"].includes(e)) return "video";
    if (["mp3", "wav", "ogg", "m4a"].includes(e)) return "audio";
    if (["txt", "md", "js", "ts", "tsx", "py", "rs", "json"].includes(e)) return "text";
    if (["pdf"].includes(e)) return "pdf";
    if (["zip", "tar", "gz", "7z", "rar"].includes(e)) return "archive";
    return "other";
}
