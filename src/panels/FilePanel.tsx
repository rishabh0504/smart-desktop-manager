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
    HardDrive,
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
    const rafRef = useRef<number | null>(null);
    const lastMouseRef = useRef<{ x: number; y: number } | null>(null);
    const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number; startX: number; startY: number } | null>(null);

    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const [renameInput, setRenameInput] = useState("");
    const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
    const [newFolderInput, setNewFolderInput] = useState("");

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

    // ── Status bar info ──────────────────────────────────────────────────────
    const statusInfo = useMemo(() => {
        const total = tab.entries.length;
        const selectedEntries = tab.entries.filter(e => tab.selection.has(e.path));
        const selectedCount = tab.selection.size;
        const selectedBytes = selectedEntries.reduce((sum, e) => sum + (e.size ?? 0), 0);
        return { total, selectedCount, selectedBytes };
    }, [tab.entries, tab.selection]);

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
            if (isCmd || isShift) { handleSelection(tab.id, entry.path, isCmd, isShift); return; }
            if (entry.is_dir) {
                setPath(tab.id, entry.path);
            } else {
                const type = getFileType(entry.extension ?? undefined);
                const meaningfulTypes = ["image", "video", "audio", "text", "pdf", "code"];
                if (!meaningfulTypes.includes(type)) { handleSelection(tab.id, entry.path, false, false); return; }
                const enabled = settings.explorer.preview_enabled?.[type as keyof typeof settings.explorer.preview_enabled] ?? true;
                if (enabled) { openPreview({ ...entry, path: entry.canonical_path }); }
                else { handleSelection(tab.id, entry.path, false, false); }
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
        } catch (err) { console.error("Delete failed:", err); }
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
                        nextIdx = e.key === "ArrowDown"
                            ? Math.min(currentIdx + 1, tab.entries.length - 1)
                            : Math.max(currentIdx - 1, 0);
                    } else {
                        nextIdx = e.key === "ArrowDown" ? 0 : tab.entries.length - 1;
                    }
                    const nextEntry = tab.entries[nextIdx];
                    if (nextEntry) handleSelection(tab.id, nextEntry.path, isCmd, isShift);
                    break;
                }
                case "Enter": {
                    e.preventDefault();
                    const firstSelected = tab.entries.find(entry => tab.selection.has(entry.path));
                    if (firstSelected?.is_dir) setPath(tab.id, firstSelected.path);
                    break;
                }
                case "Backspace":
                case "Delete": {
                    if (e.key === "Delete" || (isCmd && e.key === "Backspace")) { e.preventDefault(); handleDelete(); }
                    break;
                }
                case " ": {
                    e.preventDefault();
                    const firstSelected = tab.entries.find(entry => tab.selection.has(entry.path));
                    if (firstSelected && !firstSelected.is_dir) {
                        const type = getFileType(firstSelected.extension ?? undefined);
                        if (["image", "video", "audio", "text", "pdf", "code"].includes(type))
                            openPreview({ ...firstSelected, path: firstSelected.canonical_path });
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
        if (filesData) { sources = JSON.parse(filesData); }
        else if (singleFileData) { const entry: FileEntry = JSON.parse(singleFileData); sources = [entry.path]; }
        if (sources.length === 0) return;
        if (sources.some(src => tab.path === src || tab.path.startsWith(src + "/"))) return;
        const operationId = crypto.randomUUID();
        const isCopy = e.altKey || (e.ctrlKey && !e.metaKey);
        const command = isCopy ? "batch_copy" : "batch_move";
        try { await invoke(command, { operationId, sources, destinationDir: tab.path }); refresh(tab.id); }
        catch (err) { console.error(`${command} failed:`, err); }
    };

    const onMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        const container = parentRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const startX = e.clientX - rect.left + container.scrollLeft;
        const startY = e.clientY - rect.top + container.scrollTop;
        setSelectionRect({ startX, startY, x: startX, y: startY, width: 0, height: 0 });
        if (!e.metaKey && !e.ctrlKey) clearSelection(tab.id);
    };

    const onMouseMove = (e: React.MouseEvent) => {
        if (!selectionRect || !parentRef.current) return;
        if (rafRef.current !== null) return;
        const clientX = e.clientX;
        const clientY = e.clientY;
        const last = lastMouseRef.current;
        if (last && Math.abs(clientX - last.x) < 3 && Math.abs(clientY - last.y) < 3) return;
        lastMouseRef.current = { x: clientX, y: clientY };
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            const container = parentRef.current;
            if (!container || !selectionRect) return;
            const rect = container.getBoundingClientRect();
            const curX = clientX - rect.left + container.scrollLeft;
            const curY = clientY - rect.top + container.scrollTop;
            const x = Math.min(selectionRect.startX, curX);
            const y = Math.min(selectionRect.startY, curY);
            const width = Math.abs(selectionRect.startX - curX);
            const height = Math.abs(selectionRect.startY - curY);
            setSelectionRect({ ...selectionRect, x, y, width, height });
            const selectedInRect = new Set<string>();
            const itemElements = container.querySelectorAll("[data-path]");
            itemElements.forEach((el) => {
                const item = el as HTMLElement;
                const itemRect = { top: item.offsetTop, left: item.offsetLeft, bottom: item.offsetTop + item.offsetHeight, right: item.offsetLeft + item.offsetWidth };
                const intersects = !(itemRect.left > x + width || itemRect.right < x || itemRect.top > y + height || itemRect.bottom < y);
                if (intersects) { const path = item.getAttribute("data-path"); if (path) selectedInRect.add(path); }
            });
            selectedInRect.forEach(path => { if (!tab.selection.has(path)) handleSelection(tab.id, path, true, false); });
        });
    };

    const onMouseUp = () => {
        if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        lastMouseRef.current = null;
        setSelectionRect(null);
    };

    const handleNewFolderInPanel = useCallback(() => { setNewFolderInput("New Folder"); setIsNewFolderOpen(true); }, []);

    const confirmNewFolderInPanel = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const folderName = newFolderInput.trim();
        if (!folderName) { setIsNewFolderOpen(false); return; }
        const currentTab = useExplorerStore.getState().tabs.find((t) => t.id === tabId);
        const existingNames = currentTab?.entries.map((en) => en.name.toLowerCase()) || [];
        if (existingNames.includes(folderName.toLowerCase())) { toast.error("A folder with this name already exists in this directory"); return; }
        const currentPath = currentTab?.path;
        if (!currentPath) return;
        const base = currentPath.replace(/[/\\]+$/, "");
        const path = `${base}/${folderName}`;
        try { await invoke("create_folder", { path }); toast.success("Folder created"); setIsNewFolderOpen(false); setNewFolderInput(""); refresh(tabId); }
        catch (error) { toast.error(`Create folder failed: ${error}`); }
    };

    const handlePasteInPanel = useCallback(async () => {
        try { await pasteFromClipboard(tab.path); toast.success("Pasted"); refresh(tab.id); }
        catch (error) { toast.error(`Paste failed: ${error}`); }
    }, [tab.path, tab.id, pasteFromClipboard, refresh]);

    const handleShowFolderInFinder = useCallback(() => { invoke("show_in_finder", { path: tab.path }); }, [tab.path]);

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
        if (!newName || newName === currentName) { setIsRenameOpen(false); return; }
        try {
            await invoke("rename_item", { path: currentPath, newName });
            toast.success("Folder renamed"); setIsRenameOpen(false);
            const parent = currentPath.split(/[/\\]/).slice(0, -1).join("/");
            setPath(tab.id, `${parent}/${newName}`);
        } catch (error) { toast.error(`Rename failed: ${error}`); }
    };

    const handleCompressSelected = useCallback(async () => {
        if (tab.selection.size === 0) return;
        try {
            toast.info("Compressing selected items to zip...");
            const selectedPaths = Array.from(tab.selection);
            const parentBase = tab.path.replace(/[/\\]+$/, "") || "";
            let zipName = "Archive.zip";
            if (tab.selection.size === 1) {
                const singleName = selectedPaths[0].split(/[/\\]/).pop() || "Archive";
                zipName = `${singleName.replace(/\.[^/.]+$/, "")}.zip`;
            }
            await invoke("compress_to_zip", { paths: selectedPaths, destPath: `${parentBase}/${zipName}` });
            toast.success("Compression complete");
            useExplorerStore.getState().clearSelection(tab.id);
            refresh(tab.id);
        } catch (error) { toast.error(`Compression failed: ${error}`); }
    }, [tab.id, tab.path, tab.selection, refresh]);

    return (
        <div
            className={cn(
                "flex flex-col h-full bg-background border rounded-xl overflow-hidden transition-all duration-200",
                isActive ? "ring-2 ring-primary/25 border-primary/40 shadow-lg shadow-primary/5" : "border-border/60"
            )}
            onClick={() => setActiveTab(tab.id)}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? "copy" : "move"; }}
            onDrop={handleDrop}
        >
            {/* ── Toolbar ─────────────────────────────────────────────────────── */}
            <div className={cn(
                "shrink-0 px-2 py-1.5 border-b flex items-center gap-1 min-w-0",
                "bg-gradient-to-r from-muted/60 via-muted/30 to-transparent"
            )}>
                {/* Nav buttons */}
                <div className="flex items-center gap-0.5 shrink-0">
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg" disabled={tab.currentIndex <= 0}
                        onClick={(e) => { e.stopPropagation(); goBack(tab.id); }} title="Back">
                        <ArrowLeft className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg" disabled={tab.currentIndex >= tab.history.length - 1}
                        onClick={(e) => { e.stopPropagation(); goForward(tab.id); }} title="Forward">
                        <ArrowRight className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg"
                        onClick={(e) => { e.stopPropagation(); goParent(tab.id); }} title="Parent folder">
                        <ArrowUp className="w-3 h-3" />
                    </Button>
                    <div className="w-px h-4 bg-border mx-1 shrink-0" />
                </div>

                {/* Breadcrumbs — takes all available space, left-anchored */}
                <div className="flex-1 min-w-0">
                    <Breadcrumbs tabId={tab.id} />
                </div>

                {/* Right actions */}
                <div className="flex items-center gap-1 shrink-0">
                    <Button
                        variant="ghost" size="icon" className="h-6 w-6 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                        title="Delete selected" disabled={tab.selection.size === 0}
                    >
                        <Trash2 className="w-3 h-3" />
                    </Button>
                    <div className="w-px h-4 bg-border mx-0.5 shrink-0" />
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg"
                        onClick={(e) => { e.stopPropagation(); setViewMode(tab.id, "list"); }} title="List view">
                        <LayoutList className={cn("w-3 h-3", tab.viewMode === "list" ? "text-primary" : "opacity-40")} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg"
                        onClick={(e) => { e.stopPropagation(); setViewMode(tab.id, "grid"); }} title="Grid view">
                        <LayoutGrid className={cn("w-3 h-3", tab.viewMode === "grid" ? "text-primary" : "opacity-40")} />
                    </Button>
                </div>
            </div>

            {/* ── List column headers (sticky, only in list mode) ──────────── */}
            {tab.viewMode === "list" && (
                <div className="shrink-0 flex items-center px-4 py-1 border-b bg-muted/20 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70 select-none sticky top-0 z-10">
                    {/* Checkbox + icon + name column */}
                    <div className="flex-1 flex items-center gap-1 min-w-0 cursor-pointer" onClick={() => toggleSort(tab.id, "name")}>
                        <span>Name</span>
                        {tab.sortBy === "name"
                            ? (tab.order === "asc" ? <ChevronUp className="w-2.5 h-2.5 text-primary" /> : <ChevronDown className="w-2.5 h-2.5 text-primary" />)
                            : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />
                        }
                    </div>
                    <div className="w-16 text-right cursor-pointer shrink-0" onClick={() => toggleSort(tab.id, "size")}>
                        <span className="flex items-center justify-end gap-0.5">
                            Size {tab.sortBy === "size"
                                ? (tab.order === "asc" ? <ChevronUp className="w-2.5 h-2.5 text-primary" /> : <ChevronDown className="w-2.5 h-2.5 text-primary" />)
                                : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
                        </span>
                    </div>
                    <div className="w-20 text-right cursor-pointer shrink-0 mr-1" onClick={() => toggleSort(tab.id, "modified")}>
                        <span className="flex items-center justify-end gap-0.5">
                            Modified {tab.sortBy === "modified"
                                ? (tab.order === "asc" ? <ChevronUp className="w-2.5 h-2.5 text-primary" /> : <ChevronDown className="w-2.5 h-2.5 text-primary" />)
                                : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
                        </span>
                    </div>
                </div>
            )}

            {/* ── File content area ──────────────────────────────────────────── */}
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <div
                        ref={parentRef}
                        className="flex-1 overflow-auto outline-none relative min-h-0"
                        tabIndex={0}
                        onScroll={onScroll}
                        onMouseDown={onMouseDown}
                        onMouseMove={onMouseMove}
                        onMouseUp={onMouseUp}
                        onMouseLeave={onMouseUp}
                    >
                        {/* Loading bar */}
                        {tab.loading && (
                            <div className="absolute top-0 left-0 right-0 h-0.5 z-50 overflow-hidden bg-muted/50">
                                <div className="h-full bg-gradient-to-r from-primary/0 via-primary to-primary/0 animate-shimmer"
                                    style={{ animation: "loading-bar 1.4s ease-in-out infinite", backgroundSize: "200% 100%" }} />
                                <style>{`@keyframes loading-bar { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>
                            </div>
                        )}

                        {/* Empty state */}
                        {!tab.loading && tab.entries.length === 0 && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-muted-foreground">
                                <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center">
                                    <span className="text-3xl">📂</span>
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-semibold">Folder is empty</p>
                                    <p className="text-xs opacity-50 mt-1">Right-click to create a new folder</p>
                                </div>
                            </div>
                        )}

                        {/* Drag-selection overlay */}
                        {selectionRect && (
                            <div
                                className="absolute bg-primary/10 border border-primary/40 pointer-events-none z-50 rounded-sm"
                                style={{ left: selectionRect.x, top: selectionRect.y, width: selectionRect.width, height: selectionRect.height }}
                            />
                        )}

                        {/* Grid mode */}
                        {isGrid ? (
                            <div className="p-4 space-y-5">
                                {GROUP_ORDER.map(({ key, label }) => {
                                    const groupEntries = groupedRows.filter(
                                        (r) => r.kind === "entry" && getGroupKey(r.entry) === key
                                    ) as { kind: "entry"; entry: FileEntry }[];
                                    if (groupEntries.length === 0) return null;
                                    return (
                                        <div key={key}>
                                            <div className="flex items-center gap-2 mb-2 px-1">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
                                                <span className="text-[10px] text-muted-foreground/50 tabular-nums">{groupEntries.length}</span>
                                                <div className="flex-1 h-px bg-border/50" />
                                            </div>
                                            <div className="grid gap-3"
                                                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(80, grid_thumbnail_width + 48)}px, 1fr))` }}>
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
                            /* List mode — virtualized */
                            <div style={{ height: rowVirtualizer.getTotalSize(), width: "100%", position: "relative" }}>
                                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                    const row = groupedRows[virtualRow.index];
                                    if (!row) return null;
                                    if (row.kind === "header") {
                                        return (
                                            <div
                                                key={`header-${virtualRow.index}-${row.label}`}
                                                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                                                className="flex items-center px-4 bg-muted/20 border-b text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60"
                                            >
                                                {row.label}
                                            </div>
                                        );
                                    }
                                    const entry = row.entry;
                                    return (
                                        <div
                                            key={entry.path}
                                            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
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

                        {/* Load-more button */}
                        {tab.has_more && !tab.loading && tab.entries.length > 0 && (
                            <div className="py-2 px-4 border-t bg-muted/10 flex justify-center">
                                <Button variant="ghost" size="sm" className="text-xs" disabled={tab.loading}
                                    onClick={() => loadMore(tab.id)}>
                                    {tab.loading ? "Loading..." : `Load more (${tab.entries.length} of ${tab.total} shown)`}
                                </Button>
                            </div>
                        )}
                    </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48 text-xs [&_button]:text-xs">
                    <ContextMenuItem onClick={handleNewFolderInPanel} className="text-xs">
                        <FolderPlus className="w-3.5 h-3.5 mr-2" /> New folder
                    </ContextMenuItem>
                    <ContextMenuItem onClick={handlePasteInPanel} disabled={!clipboard || clipboard.paths.length === 0} className="text-xs">
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
                                <FileArchive className="w-3.5 h-3.5 mr-2" /> Compress {tab.selection.size} item(s) to Zip
                            </ContextMenuItem>
                        </>
                    )}
                </ContextMenuContent>
            </ContextMenu>

            {/* ── Status bar ─────────────────────────────────────────────────── */}
            <div className="shrink-0 px-3 py-1 border-t bg-muted/20 flex items-center gap-3 text-[10px] text-muted-foreground select-none">
                <div className="flex items-center gap-1">
                    <HardDrive className="w-3 h-3 opacity-50" />
                    <span>{statusInfo.total} {statusInfo.total === 1 ? "item" : "items"}{tab.has_more ? "+" : ""}</span>
                </div>
                {statusInfo.selectedCount > 0 && (
                    <>
                        <div className="w-px h-3 bg-border" />
                        <span className="text-primary font-medium">
                            {statusInfo.selectedCount} selected
                            {statusInfo.selectedBytes > 0 && ` · ${formatStatusSize(statusInfo.selectedBytes)}`}
                        </span>
                    </>
                )}
                {tab.loading && <span className="ml-auto text-muted-foreground/50 animate-pulse">Loading…</span>}
            </div>

            {/* ── Dialogs ───────────────────────────────────────────────────── */}
            <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Rename Folder</DialogTitle>
                        <DialogDescription>Enter a new name for the current directory.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={confirmRenameCurrentFolder}>
                        <div className="flex items-center space-x-2 py-4">
                            <Input autoFocus value={renameInput} onChange={(e) => setRenameInput(e.target.value)} placeholder="New folder name" className="text-sm" />
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
                        <DialogDescription>Create a new folder in this directory.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={confirmNewFolderInPanel}>
                        <div className="flex items-center space-x-2 py-4">
                            <Input autoFocus value={newFolderInput} onChange={(e) => setNewFolderInput(e.target.value)}
                                placeholder="Folder name" className="text-sm" onFocus={(e) => e.target.select()} />
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

// ── Utilities ──────────────────────────────────────────────────────────────────

function formatStatusSize(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes; let ui = 0;
    while (size >= 1024 && ui < units.length - 1) { size /= 1024; ui++; }
    return `${size.toFixed(ui === 0 ? 0 : 1)} ${units[ui]}`;
}

function getFileType(ext?: string): string {
    if (!ext) return "other";
    const e = ext.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "heic"].includes(e)) return "image";
    if (isVideoExtension(e)) return "video";
    if (["mp3", "wav", "ogg", "m4a", "flac", "aac"].includes(e)) return "audio";
    if (["txt", "md", "js", "ts", "tsx", "py", "rs", "json", "yaml", "toml", "sh"].includes(e)) return "text";
    if (e === "pdf") return "pdf";
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
