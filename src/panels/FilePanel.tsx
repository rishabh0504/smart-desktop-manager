import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useExplorerStore } from "@/stores/explorerStore";
import { usePreviewStore } from "@/stores/previewStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { FileEntry } from "@/types/explorer";
import { GridTile } from "./GridTile";
import { FileRow } from "./FileRow";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileContextMenu } from "@/components/FileContextMenu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
    FolderPlus,
    ClipboardPaste,
    RefreshCw,
    FolderOpen,
    Pencil,
    FileArchive,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { isVideoExtension } from "@/lib/fileTypes";

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
    const loadMore = useExplorerStore((state) => state.loadMore);
    const clipboard = useExplorerStore((state) => state.clipboard);
    const pasteFromClipboard = useExplorerStore((state) => state.pasteFromClipboard);
    const { openPreview } = usePreviewStore();
    const { settings, grid_thumbnail_width } = useSettingsStore();

    const parentRef = useRef<HTMLDivElement>(null);
    const loadMoreTriggered = useRef(false);
    const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number; startX: number; startY: number } | null>(null);

    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const [renameInput, setRenameInput] = useState("");
    const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
    const [newFolderInput, setNewFolderInput] = useState("");

    // Don't render until tab exists and has a path
    if (!tab || !tab.path) return null;

    const isGrid = tab.viewMode === "grid";
    const isActive = activeTabId === tab.id;

    const groupedRows = useMemo(() => groupEntries(tab.entries), [tab.entries]);

    const rowVirtualizer = useVirtualizer({
        count: groupedRows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: (i) => (groupedRows[i]?.kind === "header" ? 28 : 36),
        overscan: 20,
        enabled: !isGrid,
    });

    useEffect(() => rowVirtualizer.measure(), [tab.entries, tab.viewMode, groupedRows.length]);

    const onScroll = useCallback(() => {
        const el = parentRef.current;
        if (!el || !tab.has_more || tab.loading || loadMoreTriggered.current) return;
        const { scrollTop, scrollHeight, clientHeight } = el;
        if (scrollHeight - scrollTop - clientHeight < 400) {
            loadMoreTriggered.current = true;
            loadMore(tab.id).finally(() => { loadMoreTriggered.current = false; });
        }
    }, [tab.id, tab.has_more, tab.loading, loadMore]);

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

                const enabled = settings.explorer.preview_enabled?.[type as keyof typeof settings.explorer.preview_enabled] ?? true;
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

    const handleNewFolderInPanel = useCallback(() => {
        setNewFolderInput("New Folder");
        setIsNewFolderOpen(true);
    }, []);

    const confirmNewFolderInPanel = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const folderName = newFolderInput.trim();
        if (!folderName) {
            setIsNewFolderOpen(false);
            return;
        }

        const currentTab = useExplorerStore.getState().tabs.find((t) => t.id === tabId);
        const existingNames = currentTab?.entries.map((en) => en.name.toLowerCase()) || [];

        if (existingNames.includes(folderName.toLowerCase())) {
            toast.error("A folder with this name already exists in this directory");
            return;
        }

        const currentPath = currentTab?.path;
        if (!currentPath) return;

        const base = currentPath.replace(/[/\\]+$/, "");
        const path = `${base}/${folderName}`;

        try {
            await invoke("create_folder", { path });
            toast.success("Folder created");
            setIsNewFolderOpen(false);
            setNewFolderInput("");
            refresh(tabId);
        } catch (error) {
            toast.error(`Create folder failed: ${error}`);
        }
    };

    const handlePasteInPanel = useCallback(async () => {
        try {
            await pasteFromClipboard(tab.path);
            toast.success("Pasted");
            refresh(tab.id);
        } catch (error) {
            toast.error(`Paste failed: ${error}`);
        }
    }, [tab.path, tab.id, pasteFromClipboard, refresh]);

    const handleShowFolderInFinder = useCallback(() => {
        invoke("show_in_finder", { path: tab.path });
    }, [tab.path]);
    const handleRenameCurrentFolder = useCallback(() => {
        const currentPath = tab.path;
        const currentName = currentPath.split(/[/\\]/).pop() || currentPath;
        setRenameInput(currentName);
        setIsRenameOpen(true);
    }, [tab.path]);

    const confirmRenameCurrentFolder = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const currentPath = tab.path;
        const currentName = currentPath.split(/[/\\]/).pop() || currentPath;
        const newName = renameInput.trim();

        if (!newName || newName === currentName) {
            setIsRenameOpen(false);
            return;
        }

        try {
            await invoke("rename_item", { path: currentPath, newName });
            toast.success("Folder renamed");
            setIsRenameOpen(false);
            const parent = currentPath.split(/[/\\]/).slice(0, -1).join("/");
            const newPath = `${parent}/${newName}`;
            setPath(tab.id, newPath);
        } catch (error) {
            toast.error(`Rename failed: ${error}`);
        }
    };

    const handleCompressSelected = useCallback(async () => {
        if (tab.selection.size === 0) return;

        try {
            toast.info("Compressing selected items to zip...");
            const selectedPaths = Array.from(tab.selection);
            const parentBase = tab.path.replace(/[/\\]+$/, "") || "";
            let zipName = "Archive.zip";

            if (tab.selection.size === 1) {
                const singlePath = selectedPaths[0];
                const singleName = singlePath.split(/[/\\]/).pop() || "Archive";
                zipName = `${singleName.replace(/\.[^/.]+$/, "")}.zip`;
            }

            const destPath = `${parentBase}/${zipName}`;

            await invoke("compress_to_zip", { paths: selectedPaths, destPath });
            toast.success("Compression complete");
            // Clear selection and refresh
            useExplorerStore.getState().clearSelection(tab.id);
            refresh(tab.id);
        } catch (error) {
            toast.error(`Compression failed: ${error}`);
        }
    }, [tab.id, tab.path, tab.selection, refresh]);

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
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <div
                        ref={parentRef}
                        className="flex-1 overflow-auto outline-none relative"
                        tabIndex={0}
                        onScroll={onScroll}
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
                            <div className="p-4 space-y-6">
                                {GROUP_ORDER.map(({ key, label }) => {
                                    const groupEntries = groupedRows.filter(
                                        (r) => r.kind === "entry" && getGroupKey(r.entry) === key
                                    ) as { kind: "entry"; entry: FileEntry }[];
                                    if (groupEntries.length === 0) return null;
                                    return (
                                        <div key={key}>
                                            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                                                {label}
                                            </div>
                                            <hr className="border-border/60 mb-2" />
                                            <div
                                                className="grid gap-4"
                                                style={{
                                                    gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(80, grid_thumbnail_width + 48)}px, 1fr))`,
                                                }}
                                            >
                                                {groupEntries.map(({ entry }) => (
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
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ height: rowVirtualizer.getTotalSize(), width: "100%", position: "relative" }}>
                                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                    const row = groupedRows[virtualRow.index];
                                    if (!row) return null;
                                    if (row.kind === "header") {
                                        return (
                                            <div
                                                key={`header-${virtualRow.index}-${row.label}`}
                                                style={{
                                                    position: "absolute",
                                                    top: 0,
                                                    left: 0,
                                                    width: "100%",
                                                    height: virtualRow.size,
                                                    transform: `translateY(${virtualRow.start}px)`,
                                                }}
                                                className="flex items-center px-4 py-1.5 bg-muted/30 border-b text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                                            >
                                                {row.label}
                                            </div>
                                        );
                                    }
                                    const entry = row.entry;
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
                        {tab.has_more && !tab.loading && tab.entries.length > 0 && (
                            <div className="py-2 px-4 border-t bg-muted/20 flex justify-center">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs"
                                    disabled={tab.loading}
                                    onClick={() => loadMore(tab.id)}
                                >
                                    {tab.loading ? "Loading..." : `Load more (${tab.entries.length} of ${tab.total} shown)`}
                                </Button>
                            </div>
                        )}
                    </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-44 text-xs [&_button]:text-xs">
                    <ContextMenuItem onClick={handleNewFolderInPanel} className="text-xs">
                        <FolderPlus className="w-3.5 h-3.5 mr-2" /> New folder
                    </ContextMenuItem>
                    <ContextMenuItem
                        onClick={handlePasteInPanel}
                        disabled={!clipboard || clipboard.paths.length === 0}
                        className="text-xs"
                    >
                        <ClipboardPaste className="w-3.5 h-3.5 mr-2" /> Paste
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => refresh(tab.id)} className="text-xs">
                        <RefreshCw className="w-3.5 h-3.5 mr-2" /> Refresh
                    </ContextMenuItem>
                    <ContextMenuItem onClick={handleShowFolderInFinder} className="text-xs">
                        <FolderOpen className="w-3.5 h-3.5 mr-2" /> Show in Finder
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={handleRenameCurrentFolder} className="text-xs">
                        <Pencil className="w-3.5 h-3.5 mr-2" /> Rename this folder
                    </ContextMenuItem>

                    {tab.selection.size > 0 && (
                        <>
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={handleCompressSelected} className="text-xs">
                                <FileArchive className="w-3.5 h-3.5 mr-2" /> Compress {tab.selection.size} selected item(s) to Zip
                            </ContextMenuItem>
                        </>
                    )}
                </ContextMenuContent>
            </ContextMenu>

            <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Rename Folder</DialogTitle>
                        <DialogDescription>
                            Enter a new name for the current directory.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={confirmRenameCurrentFolder}>
                        <div className="flex items-center space-x-2 py-4">
                            <Input
                                autoFocus
                                value={renameInput}
                                onChange={(e) => setRenameInput(e.target.value)}
                                placeholder="New folder name"
                                className="text-sm"
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsRenameOpen(false)}>Cancel</Button>
                            <Button type="submit">Rename</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>New Folder</DialogTitle>
                        <DialogDescription>
                            Create a new folder in this directory.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={confirmNewFolderInPanel}>
                        <div className="flex items-center space-x-2 py-4">
                            <Input
                                autoFocus
                                value={newFolderInput}
                                onChange={(e) => setNewFolderInput(e.target.value)}
                                placeholder="Folder name"
                                className="text-sm"
                                onFocus={(e) => e.target.select()}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsNewFolderOpen(false)}>Cancel</Button>
                            <Button type="submit">Create</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
};

// Utility: file type detection
function getFileType(ext?: string): string {
    if (!ext) return "other";
    const e = ext.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(e)) return "image";
    if (isVideoExtension(e)) return "video";
    if (["mp3", "wav", "ogg", "m4a"].includes(e)) return "audio";
    if (["txt", "md", "js", "ts", "tsx", "py", "rs", "json"].includes(e)) return "text";
    if (["pdf"].includes(e)) return "pdf";
    if (["zip", "tar", "gz", "7z", "rar"].includes(e)) return "archive";
    return "other";
}

type GroupRow = { kind: "header"; label: string } | { kind: "entry"; entry: FileEntry };

const GROUP_ORDER: { key: string; label: string }[] = [
    { key: "folder", label: "Folders" },
    { key: "image", label: "Images" },
    { key: "video", label: "Videos" },
    { key: "audio", label: "Audio" },
    { key: "document", label: "Documents" },
    { key: "archive", label: "Archives" },
    { key: "other", label: "Other" },
];

function getGroupKey(entry: FileEntry): string {
    if (entry.is_dir) return "folder";
    const t = getFileType(entry.extension ?? undefined);
    if (t === "pdf" || t === "text") return "document";
    return t;
}

function groupEntries(entries: FileEntry[]): GroupRow[] {
    const byGroup = new Map<string, FileEntry[]>();
    for (const e of entries) {
        const key = getGroupKey(e);
        if (!byGroup.has(key)) byGroup.set(key, []);
        byGroup.get(key)!.push(e);
    }
    const rows: GroupRow[] = [];
    for (const { key, label } of GROUP_ORDER) {
        const groupEntries = byGroup.get(key);
        if (!groupEntries?.length) continue;
        rows.push({ kind: "header", label });
        for (const entry of groupEntries) rows.push({ kind: "entry", entry });
    }
    return rows;
}
