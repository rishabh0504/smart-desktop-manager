import { Button } from "@/components/ui/button";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuSeparator
} from "@/components/ui/context-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useDedupeStore } from "@/stores/dedupeStore";
import { useExplorerStore } from "@/stores/explorerStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useSidebarStore } from "@/stores/sidebarStore";
import { useCleanStore } from "@/stores/cleanStore";
import { TreeNode } from "@/types/explorer";
import { invoke } from "@tauri-apps/api/core";
import {
    ChevronRight,
    CopyCheck,
    Download,
    FileSearch,
    Files,
    Film,
    FolderHeart,
    HardDrive,
    Home,
    Image as ImageIcon,
    LayoutGrid,
    Monitor,
    Music,
    Star,
    Usb,
    Eraser,
    Pencil
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { homeDir } from "@tauri-apps/api/path";

export const Sidebar = () => {
    const { volumes, favorites, isCollapsed, refreshVolumes } = useSidebarStore();
    const activeView = useExplorerStore(state => state.activeView);
    const setActiveView = useExplorerStore(state => state.setActiveView);
    const { settings } = useSettingsStore();
    const [homePath, setHomePath] = useState<string>("");

    useEffect(() => {
        refreshVolumes();
        homeDir().then(setHomePath);
    }, [refreshVolumes, settings.explorer.show_system_files]);

    if (isCollapsed) return null;

    // Filter volumes
    const externalDrives = volumes.filter(v => v.is_removable && v.mount_point !== "/");
    // const systemVolumes = volumes.filter(v => !v.is_removable || v.mount_point === "/"); // Maybe hide system volume if redundant?

    return (
        <div className="w-64 h-full bg-muted/10 border-r flex flex-col transition-all duration-300 ease-in-out select-none">
            {/* Top section now only contains generic layout padding or empty if all views are footer-based */}

            <ScrollArea className="flex-1">
                <div className="p-3 space-y-6">
                    {/* Places (User Home Folders) */}
                    {homePath && (
                        <section>
                            <h3 className="px-2 mb-2 text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center justify-between">
                                Places
                                <Home className="w-3 h-3 text-blue-500/50" />
                            </h3>
                            <div className="space-y-0.5">
                                <TreeItem
                                    node={{ name: "Home", path: homePath, is_dir: true, has_children: true }}
                                    depth={0}
                                    icon={<Home className="w-4 h-4 text-blue-500" />}
                                />
                                <TreeItem
                                    node={{ name: "Desktop", path: `${homePath}/Desktop`, is_dir: true, has_children: true }}
                                    depth={0}
                                    icon={<Monitor className="w-4 h-4 text-indigo-500" />}
                                />
                                <TreeItem
                                    node={{ name: "Documents", path: `${homePath}/Documents`, is_dir: true, has_children: true }}
                                    depth={0}
                                    icon={<Files className="w-4 h-4 text-cyan-500" />}
                                />
                                <TreeItem
                                    node={{ name: "Downloads", path: `${homePath}/Downloads`, is_dir: true, has_children: true }}
                                    depth={0}
                                    icon={<Download className="w-4 h-4 text-green-500" />}
                                />
                                <TreeItem
                                    node={{ name: "Pictures", path: `${homePath}/Pictures`, is_dir: true, has_children: true }}
                                    depth={0}
                                    icon={<ImageIcon className="w-4 h-4 text-pink-500" />}
                                />
                                <TreeItem
                                    node={{ name: "Music", path: `${homePath}/Music`, is_dir: true, has_children: true }}
                                    depth={0}
                                    icon={<Music className="w-4 h-4 text-purple-500" />}
                                />
                                <TreeItem
                                    node={{ name: "Movies", path: `${homePath}/Movies`, is_dir: true, has_children: true }}
                                    depth={0}
                                    icon={<Film className="w-4 h-4 text-red-500" />}
                                />
                            </div>
                        </section>
                    )}

                    {/* External Drives */}
                    {externalDrives.length > 0 && (
                        <section>
                            <h3 className="px-2 mb-2 text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center justify-between">
                                External Drives
                                <Usb className="w-3 h-3 text-orange-500/50" />
                            </h3>
                            <div className="space-y-0.5">
                                {externalDrives.map(vol => (
                                    <TreeItem
                                        key={vol.mount_point}
                                        node={{ name: vol.name, path: vol.mount_point, is_dir: true, has_children: true }}
                                        depth={0}
                                        icon={<HardDrive className="w-4 h-4 text-orange-400" />}
                                        subLabel={formatSpace(vol.available_space)}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Favorites (Pinned) */}
                    {favorites.length > 0 && (
                        <section>
                            <h3 className="px-2 mb-2 text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center justify-between">
                                Favorites
                                <Star className="w-3 h-3 text-yellow-500/50" />
                            </h3>
                            <div className="space-y-0.5">
                                {favorites.map(fav => (
                                    <TreeItem
                                        key={fav}
                                        node={{ name: fav.split(/[/\\]/).pop() || fav, path: fav, is_dir: true, has_children: true }}
                                        depth={0}
                                        icon={<FolderHeart className="w-4 h-4 text-yellow-500" />}
                                    />
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            </ScrollArea>

            <div className="p-3 border-t bg-muted/10 space-y-1">
                <Button
                    variant={activeView === "explorer" ? "secondary" : "ghost"}
                    size="sm"
                    className={cn(
                        "w-full justify-start gap-2 text-xs h-9 transition-all",
                        activeView === "explorer" && "font-bold text-primary shadow-sm"
                    )}
                    onClick={() => setActiveView("explorer")}
                >
                    <LayoutGrid className="w-4 h-4" />
                    Explorer
                </Button>
                <Button
                    variant={activeView === "dedupe" ? "secondary" : "ghost"}
                    size="sm"
                    className={cn(
                        "w-full justify-start gap-2 text-xs h-9 transition-all",
                        activeView === "dedupe" && "font-bold text-primary shadow-sm"
                    )}
                    onClick={() => setActiveView("dedupe")}
                >
                    <CopyCheck className="w-4 h-4" />
                    Duplicate Finder
                </Button>
                <Button
                    variant={activeView === "content_search" ? "secondary" : "ghost"}
                    size="sm"
                    className={cn(
                        "w-full justify-start gap-2 text-xs h-9 transition-all",
                        activeView === "content_search" && "font-bold text-primary shadow-sm"
                    )}
                    onClick={() => setActiveView("content_search")}
                >
                    <FileSearch className="w-4 h-4" />
                    Content Search
                </Button>
                <Button
                    variant={activeView === "clean" ? "secondary" : "ghost"}
                    size="sm"
                    className={cn(
                        "w-full justify-start gap-2 text-xs h-9 transition-all",
                        activeView === "clean" && "font-bold text-primary shadow-sm"
                    )}
                    onClick={() => setActiveView("clean")}
                >
                    <Eraser className="w-4 h-4" />
                    Clean View
                </Button>
            </div>
        </div>
    );
};

interface TreeItemProps {
    node: TreeNode;
    depth: number;
    icon?: React.ReactNode;
    subLabel?: string;
}

const TreeItem = ({ node, depth, icon, subLabel }: TreeItemProps) => {
    const { expandedPaths, toggleExpand, treeNodes, handlePathClick, refreshVolumes } = useSidebarStore();
    const isExpanded = expandedPaths.has(node.path);
    const children = treeNodes[node.path] || [];
    const [isDragOver, setIsDragOver] = useState(false);
    const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);

    const onChevronClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        toggleExpand(node.path);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (node.is_dir) {
            setIsDragOver(true);
            e.dataTransfer.dropEffect = "move";

            if (!isExpanded && !hoverTimerRef.current) {
                hoverTimerRef.current = setTimeout(() => {
                    toggleExpand(node.path);
                }, 600);
            }
        }
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }

        const filesData = e.dataTransfer.getData("application/x-super-explorer-files");
        if (!filesData) return;

        try {
            const sources: string[] = JSON.parse(filesData);
            if (sources.length === 0) return;

            // Don't drop into self or subfolders
            if (sources.some(src => node.path === src || node.path.startsWith(src + "/"))) return;

            await invoke("batch_move", {
                operationId: crypto.randomUUID(),
                sources,
                destinationDir: node.path
            });
            // Refresh would ideally happen here, but since it's sidebar, 
            // the main explorer view might need refresh if it's showing the target.
        } catch (err) {
            console.error("Drop failed:", err);
        }
    };

    const addToDedupe = useDedupeStore(state => state.addToQueue);
    const addToClean = useCleanStore(state => state.addToQueue);
    const setActiveView = useExplorerStore(state => state.setActiveView);

    const handleAddToDedupe = (e: React.MouseEvent) => {
        e.stopPropagation();
        addToDedupe(node.path);
        toast.success("Added to Duplicate Finder queue");
        setActiveView("dedupe");
    };
    const handleRename = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const newName = window.prompt("Enter new name:", node.name);
        if (!newName || newName === node.name) return;
        try {
            await invoke("rename_item", { path: node.path, newName });
            toast.success("Renamed successfully");
            refreshVolumes();
        } catch (error) {
            toast.error(`Rename failed: ${error}`);
        }
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger>
                <div className="flex flex-col">
                    <div
                        className={cn(
                            "group flex items-center gap-2 px-2 py-1 rounded-md hover:bg-accent/50 cursor-pointer transition-colors relative transition-all duration-200",
                            "before:absolute before:left-0 before:w-1 before:h-4 before:bg-primary before:rounded-r-full before:opacity-0 hover:before:opacity-100 before:transition-opacity",
                            isDragOver && "bg-primary/20 ring-1 ring-primary/50"
                        )}
                        style={{ paddingLeft: `${depth * 12 + 8}px` }}
                        onClick={() => handlePathClick(node.path)}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <div
                            className={cn(
                                "p-0.5 rounded-sm hover:bg-muted-foreground/10 transition-transform",
                                isExpanded && "rotate-90"
                            )}
                            onClick={onChevronClick}
                        >
                            {node.has_children ? (
                                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                            ) : (
                                <div className="w-3 h-3" />
                            )}
                        </div>

                        <div className="text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0">
                            {icon || <FolderHeart className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />}
                        </div>

                        <div className="flex-1 flex flex-col min-w-0">
                            <span className="text-[12px] font-medium truncate tracking-tight">{node.name}</span>
                            {subLabel && <span className="text-[9px] text-muted-foreground leading-none">{subLabel} free</span>}
                        </div>
                    </div>

                    {isExpanded && node.has_children && (
                        <div className="flex flex-col">
                            {children.length > 0 ? (
                                children.map(child => (
                                    <TreeItem
                                        key={child.path}
                                        node={child}
                                        depth={depth + 1}
                                    />
                                ))
                            ) : (
                                <div
                                    className="text-[10px] text-muted-foreground italic py-1"
                                    style={{ paddingLeft: `${(depth + 1) * 12 + 24}px` }}
                                >
                                    Loading...
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
                <ContextMenuItem onClick={() => handlePathClick(node.path)}>
                    Open
                </ContextMenuItem>
                <ContextMenuItem onClick={handleAddToDedupe}>
                    <CopyCheck className="w-4 h-4 mr-2" />
                    Find Duplicates
                </ContextMenuItem>
                <ContextMenuItem onClick={(e) => {
                    e.stopPropagation();
                    addToClean(node.path);
                    toast.success("Added to Clean View queue");
                    setActiveView("clean");
                }}>
                    <Eraser className="w-4 h-4 mr-2" />
                    Clean Empty Folders
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleRename}>
                    <Pencil className="w-4 h-4 mr-2" />
                    Rename
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
};

function formatSpace(bytes: number): string {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
}
