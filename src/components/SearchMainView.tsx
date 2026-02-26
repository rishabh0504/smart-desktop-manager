import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectSeparator,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    ARCHIVE_EXTENSIONS,
    AUDIO_EXTENSIONS,
    DOCUMENT_EXTENSIONS,
    IMAGE_EXTENSIONS,
    TEXT_EXTENSIONS,
    VIDEO_EXTENSIONS
} from "@/lib/fileTypes";
import { cn } from "@/lib/utils";
import { useDeleteQueueStore } from "@/stores/deleteQueueStore";
import { useExplorerStore } from "@/stores/explorerStore";
import { useMoveQueueStore } from "@/stores/moveQueueStore";
import { useSidebarStore } from "@/stores/sidebarStore";
import { FileEntry, SearchResult } from "@/types/explorer";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { homeDir } from "@tauri-apps/api/path";
import { ExternalLink, FileText, FolderInput, ListMinus, ListPlus, Loader2, Play, RefreshCw, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FilePreviewContent } from "./FilePreviewContent";
import { SearchBreadcrumbs } from "./search/SearchBreadcrumbs";
import { SearchResultRow } from "./search/SearchResultRow";

const ROW_ESTIMATE = 52;
const OVERCAN = 12;
const BATCH_FLUSH_MS = 120;
const BATCH_FLUSH_SIZE = 80;

interface SearchMainViewProps {
    isTab?: boolean;
    initialQuery?: string;
    initialResults?: SearchResult[];
    initialVolume?: string;
    onClose?: () => void;
    onKeepTab?: (results: SearchResult[], query: string) => void;
}

export const SearchMainView = ({
    isTab = false,
    initialQuery = "",
    initialResults = [],
    initialVolume,
    onClose,
    onKeepTab
}: SearchMainViewProps) => {
    const volumes = useSidebarStore((state) => state.volumes);
    const activeTabId = useExplorerStore((state) => state.activeTabId);
    const tabs = useExplorerStore((state) => state.tabs);
    const activeTab = tabs.find((t) => t.id === activeTabId);
    const addTab = useExplorerStore((state) => state.addTab);

    // Queue Stores
    const deleteQueue = useDeleteQueueStore((state) => state.queue);
    const addToDeleteQueue = useDeleteQueueStore((state) => state.addToQueue);
    const removeFromDeleteQueue = useDeleteQueueStore((state) => state.removeFromQueue);
    const moveQueues = useMoveQueueStore((state) => state.queues);
    const addToMoveQueue = useMoveQueueStore((state) => state.addToQueue);
    const removeFromMoveQueue = useMoveQueueStore((state) => state.removeFromQueue);
    const findQueuesContainingPath = useMoveQueueStore((state) => state.findQueuesContainingPath);

    const [selectedMoveQueueId, setSelectedMoveQueueId] = useState<string>("");

    const [homePath, setHomePath] = useState<string>("");
    const favorites = useSidebarStore((state) => state.favorites);

    useEffect(() => {
        homeDir().then(setHomePath);
    }, []);

    const [query, setQuery] = useState(initialQuery);
    const [results, setResults] = useState<SearchResult[]>(initialResults);
    const [searching, setSearching] = useState(false);
    // Keep a ref always in sync with the current search ID so cancelSearch never captures a stale value
    const searchIdRef = useRef<string | null>(null);

    const [searchType, setSearchType] = useState<"file" | "content">("file");
    const [itemType, setItemType] = useState<string>("both");
    const [selectedVolume, setSelectedVolume] = useState<string>(initialVolume || activeTab?.path || "/");

    const [selectedResultIndex, setSelectedResultIndex] = useState<number>(initialResults.length > 0 ? 0 : -1);
    const selectedResult = selectedResultIndex >= 0 ? results[selectedResultIndex] : null;

    const parentRef = useRef<HTMLDivElement>(null);

    // Navigation and Keyboard Logic
    const handleNavigateToFolder = useCallback((path: string) => {
        addTab(path);
        if (onClose) onClose();
    }, [addTab, onClose]);

    const handleOpenItem = useCallback((path: string) => {
        invoke("open_item", { path });
    }, []);

    const handleOpenInFinder = useCallback((path: string) => {
        invoke("show_in_finder", { path });
    }, []);

    const isInDeleteQueue = selectedResult ? deleteQueue.some((e) => e.path === selectedResult.path) : false;
    const moveQueueIdsContainingTarget = selectedResult ? findQueuesContainingPath(selectedResult.path) : [];
    const isInMoveQueue = moveQueueIdsContainingTarget.length > 0;

    const currentFileEntry = selectedResult ? {
        path: selectedResult.path,
        name: selectedResult.name,
        is_dir: selectedResult.is_dir,
        size: selectedResult.size,
        canonical_path: selectedResult.path,
        extension: selectedResult.name.split('.').pop() || "",
        modified: null
    } as FileEntry : null;

    const handleToggleDelete = () => {
        if (!currentFileEntry) return;
        if (isInDeleteQueue) {
            removeFromDeleteQueue(currentFileEntry.path);
            toast.info("Removed from delete queue");
        } else {
            addToDeleteQueue(currentFileEntry);
            toast.success("Added to delete queue");
        }
    };

    const handleToggleMove = () => {
        if (!currentFileEntry) return;
        if (isInMoveQueue) {
            moveQueueIdsContainingTarget.forEach(id => removeFromMoveQueue(id, currentFileEntry.path));
            toast.info("Removed from move queue");
        } else {
            if (!selectedMoveQueueId) {
                toast.error("Please select or create a move queue first");
                return;
            }
            addToMoveQueue(selectedMoveQueueId, currentFileEntry);
            toast.success("Added to move queue");
        }
    };

    const virtualizer = useVirtualizer({
        count: results.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => ROW_ESTIMATE,
        overscan: OVERCAN,
    });

    const cancelSearch = useCallback(async () => {
        const id = searchIdRef.current;
        if (id) {
            await invoke("cancel_operation", { operation_id: id });
            setSearching(false);
            searchIdRef.current = null;
        }
    }, []); // no deps — always reads from ref

    const startSearch = useCallback(async () => {
        if (!query) return;
        // Cancel existing search first (using ref so we always get the current ID)
        const existingId = searchIdRef.current;
        if (existingId) {
            await invoke("cancel_operation", { operation_id: existingId }).catch(() => { });
        }

        const newSearchId = crypto.randomUUID();
        searchIdRef.current = newSearchId;
        setSearching(true);
        setResults([]);
        setSelectedResultIndex(-1);

        let buffer: SearchResult[] = [];
        let flushTimer: ReturnType<typeof setTimeout> | null = null;

        const flush = () => {
            if (flushTimer) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
            if (buffer.length === 0) return;
            const batch = [...buffer];
            buffer = [];
            setResults((prev) => [...prev, ...batch]);
        };

        let unlistenResult: (() => void) | null = null;
        let unlistenComp: (() => void) | null = null;

        try {
            unlistenResult = await listen<SearchResult>("search_result", (event) => {
                buffer.push(event.payload);
                if (buffer.length >= BATCH_FLUSH_SIZE) {
                    flush();
                } else if (!flushTimer) {
                    flushTimer = setTimeout(flush, BATCH_FLUSH_MS);
                }
            });

            unlistenComp = await listen<string>("search_completed", (event) => {
                if (event.payload === newSearchId) {
                    flush();
                    setSearching(false);
                    searchIdRef.current = null;
                    if (unlistenResult) unlistenResult();
                    if (unlistenComp) unlistenComp();
                }
            });

            const getExtensions = () => {
                switch (itemType) {
                    case "images": return IMAGE_EXTENSIONS;
                    case "videos": return VIDEO_EXTENSIONS;
                    case "audio": return AUDIO_EXTENSIONS;
                    case "documents": return DOCUMENT_EXTENSIONS;
                    case "archives": return ARCHIVE_EXTENSIONS;
                    case "text": return TEXT_EXTENSIONS;
                    default: return undefined;
                }
            };

            const searchOptions = {
                itemType: (itemType === "file" || itemType === "folder" || itemType === "both") ? itemType : "file",
                extensions: getExtensions(),
            };

            const cmd = searchType === "file" ? "start_file_search" : "start_content_search";

            await invoke(cmd, {
                searchId: newSearchId,
                root: selectedVolume,
                pattern: query,
                ...searchOptions
            });
        } catch (error) {
            console.error("Search failed:", error);
            toast.error("Search operation failed");
            setSearching(false);
            searchIdRef.current = null;
            if (unlistenResult) unlistenResult();
            if (unlistenComp) unlistenComp();
        }
    }, [query, searchType, itemType, selectedVolume]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedResultIndex((prev) => Math.min(results.length - 1, prev + 1));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedResultIndex((prev) => Math.max(0, prev - 1));
            } else if (e.key === "Enter" && selectedResult) {
                e.preventDefault();
                handleOpenItem(selectedResult.path);
            }
        };

        // This listener might need to be more scoped if used in multiple places,
        // but for now it's okay for the dialog/active tab.
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [results.length, selectedResult, handleOpenItem]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            const id = searchIdRef.current;
            if (id) invoke("cancel_operation", { operation_id: id }).catch(() => { });
        };
    }, []);

    // Keep selected move queue valid
    useEffect(() => {
        if (moveQueues.length === 0) setSelectedMoveQueueId("");
        else if (!selectedMoveQueueId || !moveQueues.some((q) => q.id === selectedMoveQueueId))
            setSelectedMoveQueueId(moveQueues[0].id);
    }, [moveQueues, selectedMoveQueueId]);

    return (
        <div className="w-full h-full flex flex-col overflow-hidden outline-none bg-background/95 selection:bg-primary/20">
            <div className="px-4 py-3 flex flex-wrap gap-4 items-end border-b bg-muted/10">
                <div className="w-1/4 min-w-[300px] space-y-1.5">
                    <div className="flex justify-between items-center">
                        <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Search Query</label>
                        <div className="flex gap-2">
                            <Button
                                variant={searchType === "file" ? "secondary" : "ghost"}
                                size="sm"
                                className="h-5 text-[9px] px-2 rounded-full uppercase"
                                onClick={() => setSearchType("file")}
                            >
                                Filename
                            </Button>
                            <Button
                                variant={searchType === "content" ? "secondary" : "ghost"}
                                size="sm"
                                className="h-5 text-[9px] px-2 rounded-full uppercase"
                                onClick={() => setSearchType("content")}
                            >
                                Content
                            </Button>
                        </div>
                    </div>
                    <div className="relative group">
                        <Input
                            value={query}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                            placeholder={searchType === "file" ? "e.g. *.jpg, document" : "e.g. function handleSearch"}
                            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && startSearch()}
                            className="pr-10 h-8 border-muted focus-visible:ring-primary/30 text-xs"
                            autoFocus
                        />
                        {query && (
                            <X
                                className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                                onClick={() => setQuery("")}
                            />
                        )}
                    </div>
                </div>

                <div className="flex gap-4 flex-wrap items-end">
                    <div className="space-y-1">
                        <label className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">Search Location</label>
                        <Select value={selectedVolume} onValueChange={setSelectedVolume}>
                            <SelectTrigger className="w-[200px] h-8 text-xs">
                                <SelectValue placeholder="Select Location" />
                            </SelectTrigger>
                            <SelectContent className="max-h-[400px]">
                                {homePath && (
                                    <SelectGroup>
                                        <SelectLabel className="text-[9px] uppercase opacity-50 px-2 py-1">Places</SelectLabel>
                                        <SelectItem value={homePath}>Home</SelectItem>
                                        <SelectItem value={`${homePath}/Desktop`}>Desktop</SelectItem>
                                        <SelectItem value={`${homePath}/Documents`}>Documents</SelectItem>
                                        <SelectItem value={`${homePath}/Downloads`}>Downloads</SelectItem>
                                        <SelectItem value={`${homePath}/Pictures`}>Pictures</SelectItem>
                                        <SelectItem value={`${homePath}/Music`}>Music</SelectItem>
                                        <SelectItem value={`${homePath}/Movies`}>Movies</SelectItem>
                                    </SelectGroup>
                                )}

                                <SelectGroup>
                                    <SelectLabel className="text-[9px] uppercase opacity-50 px-2 py-1">Drives</SelectLabel>
                                    {volumes.map((v) => (
                                        <SelectItem key={v.mount_point} value={v.mount_point}>
                                            {v.name} {v.is_removable ? "(Removable)" : ""}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>

                                {favorites.length > 0 && (
                                    <SelectGroup>
                                        <SelectLabel className="text-[9px] uppercase opacity-50 px-2 py-1">Favorites</SelectLabel>
                                        {favorites.map((fav) => (
                                            <SelectItem key={fav} value={fav}>
                                                {fav.split(/[/\\]/).pop() || fav}
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">Type</label>
                        <Select value={itemType} onValueChange={setItemType}>
                            <SelectTrigger className="w-[90px] h-8 text-xs text-center">
                                <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent side="bottom" align="end">
                                <SelectItem value="both">Both</SelectItem>
                                <SelectItem value="file">Files</SelectItem>
                                <SelectItem value="folder">Folders</SelectItem>
                                <SelectSeparator className="my-1 opacity-20" />
                                <SelectItem value="images">Images</SelectItem>
                                <SelectItem value="videos">Videos</SelectItem>
                                <SelectItem value="audio">Audio</SelectItem>
                                <SelectItem value="documents">Documents</SelectItem>
                                <SelectItem value="archives">Archives</SelectItem>
                                <SelectItem value="text">Code/Text</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>


                    <Button
                        className="h-8 px-5 text-xs font-bold shadow-lg shadow-primary/20 transition-all"
                        onClick={startSearch}
                        disabled={!query}
                    >
                        {searching ? <><RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />Re-Search</> : <><Search className="w-3.5 h-3.5 mr-2" /> Search</>}
                    </Button>
                    {!isTab && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-[10px] font-bold gap-1.5 border-dashed"
                            onClick={() => {
                                if (results.length > 0) {
                                    if (onKeepTab) {
                                        onKeepTab(results, query);
                                    } else {
                                        useExplorerStore.getState().addSearchResultsTab(results, query);
                                        if (onClose) onClose();
                                        toast.success("Results opened in new tab");
                                    }
                                } else {
                                    toast.error("No results to keep in tab");
                                }
                            }}
                        >
                            <ExternalLink className="w-3 h-3" />
                            KEEP TAB
                        </Button>
                    )}
                </div>
            </div>

            {/* Top Toolbar for Tab - Breadcrumbs */}
            {/* {isTab && tabId && (
                <div className="px-4 py-1 border-b bg-muted/20 flex items-center justify-between">
                    <Breadcrumbs tabId={tabId} />
                </div>
            )} */}

            <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Left: Results List (Main Area) */}
                <div className="flex-1 border-r flex flex-col relative bg-muted/5 min-w-0 min-h-0">
                    {/* Header for results with breadcrumbs */}
                    {isTab && (
                        <div className="px-4 py-2 border-b bg-muted/10 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2">
                                <Search className="w-3.5 h-3.5 text-primary/70" />
                                <span className="text-[10px] uppercase font-black tracking-tighter opacity-70">Results Overview</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 hover:bg-muted"
                                    onClick={startSearch}
                                    disabled={searching || !query}
                                    title="Refresh Search"
                                >
                                    <RefreshCw className={cn("w-3 h-3 text-muted-foreground", searching && "animate-spin")} />
                                </Button>
                            </div>
                            <div className="shrink-0">
                                {results.length > 0 && (
                                    <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded border border-muted-foreground/10">
                                        Found {results.length} items
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                    <div ref={parentRef} className="flex-1 overflow-auto p-3 scrollbar-hide">
                        {results.length === 0 && !searching && query && (
                            <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-3 mt-12 opacity-40">
                                <Search className="w-12 h-12" />
                                <p>No results found</p>
                            </div>
                        )}
                        {results.length > 0 && (
                            <div
                                style={{ height: virtualizer.getTotalSize(), position: "relative" }}
                                className="pr-1"
                            >
                                {virtualizer.getVirtualItems().map((virtualRow) => {
                                    const result = results[virtualRow.index];
                                    if (!result) return null;
                                    return (
                                        <SearchResultRow
                                            key={`${result.path}-${virtualRow.index}`}
                                            result={result}
                                            isSelected={selectedResultIndex === virtualRow.index}
                                            onSelect={() => setSelectedResultIndex(virtualRow.index)}
                                            style={{
                                                height: virtualRow.size,
                                                transform: `translateY(${virtualRow.start}px)`,
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        )}
                        {searching && results.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
                                <div className="relative">
                                    <Loader2 className="w-12 h-12 animate-spin text-primary opacity-20" />
                                    <Search className="w-6 h-6 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-40" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-bold">Scanning...</p>
                                    <p className="text-[10px] opacity-60">Working through {selectedVolume}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Preview Pane */}
                <div className="flex-1 bg-background flex flex-col relative overflow-hidden min-h-0">
                    {selectedResult ? (
                        <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 min-h-0">
                            {/* Top: Preview Content */}
                            <div className="flex-1 flex flex-col bg-muted/20 relative group/preview border-b min-h-0">
                                <div className="flex-1 h-full min-h-0 flex items-center justify-center bg-muted/30 overflow-hidden">
                                    <FilePreviewContent
                                        path={selectedResult.path}
                                        extension={selectedResult.name.split('.').pop() || ""}
                                        name={selectedResult.name}
                                        is_dir={selectedResult.is_dir}
                                        section={isTab ? "explorer" : "content_search"}
                                    />
                                </div>
                            </div>

                            {/* Bottom: Standard Metadata/Actions Sidebar */}
                            <div className="h-[280px] flex flex-col bg-muted/5 overflow-hidden shrink-0">
                                <div className="p-4 border-b bg-muted/20">
                                    <div className="flex flex-col gap-1.5 min-w-0">
                                        <h3 className="text-base font-black truncate tracking-tighter leading-tight text-foreground">{selectedResult.name}</h3>
                                        <div className="mt-1">
                                            <SearchBreadcrumbs path={selectedResult.path} onNavigate={handleNavigateToFolder} />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-auto p-4 space-y-6">
                                    {/* Actions Section */}
                                    <div className="space-y-3">
                                        <span className="text-[9px] uppercase text-muted-foreground font-black tracking-widest block mb-2">Actions</span>
                                        <div className="grid grid-cols-3 gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 text-[9px] font-bold gap-1 px-1"
                                                onClick={() => handleOpenInFinder(selectedResult.path)}
                                            >
                                                <ExternalLink className="w-3 h-3" />
                                                REVEAL
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 text-[9px] font-bold gap-1 text-primary px-1"
                                                onClick={() => handleOpenItem(selectedResult.path)}
                                            >
                                                <Play className="w-3 h-3" />
                                                OPEN
                                            </Button>
                                            <Button
                                                variant={isInDeleteQueue ? "destructive" : "outline"}
                                                size="sm"
                                                className={cn(
                                                    "h-8 text-[9px] font-bold gap-1 justify-center px-1",
                                                    isInDeleteQueue && "bg-destructive/10 border-destructive/30 text-destructive"
                                                )}
                                                onClick={handleToggleDelete}
                                            >
                                                {isInDeleteQueue ? <ListMinus className="w-3 h-3" /> : <ListPlus className="w-3 h-3" />}
                                                DELETE
                                            </Button>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="col-span-2">
                                                <Select
                                                    value={selectedMoveQueueId}
                                                    onValueChange={setSelectedMoveQueueId}
                                                    disabled={isInMoveQueue || moveQueues.length === 0}
                                                >
                                                    <SelectTrigger className="w-full h-8 text-[10px] bg-background">
                                                        <SelectValue placeholder={moveQueues.length > 0 ? "Target Queue" : "No Queues"} />
                                                    </SelectTrigger>
                                                    <SelectContent side="bottom" align="center">
                                                        {moveQueues.map((q) => (
                                                            <SelectItem key={q.id} value={q.id} className="text-[10px]">
                                                                {q.name} ({q.items.length})
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <Button
                                                variant={isInMoveQueue ? "default" : "outline"}
                                                size="sm"
                                                className={cn(
                                                    "col-span-1 h-8 text-[9px] font-bold gap-1 justify-center px-1",
                                                    isInMoveQueue && "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                                                )}
                                                onClick={handleToggleMove}
                                                disabled={!selectedMoveQueueId && !isInMoveQueue}
                                            >
                                                {isInMoveQueue ? <ListMinus className="w-3 h-3" /> : <FolderInput className="w-3 h-3" />}
                                                MOVE
                                            </Button>
                                        </div>
                                    </div>


                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-10 text-center gap-6 animate-pulse opacity-40">
                            <div className="w-20 h-20 rounded-3xl bg-muted/50 flex items-center justify-center border-2 border-dashed border-muted rotate-3">
                                <FileText className="w-8 h-8 opacity-20" />
                            </div>
                            <div className="space-y-2">
                                <p className="text-[11px] font-black tracking-tight uppercase">Quick Preview</p>
                                <p className="text-[9px] opacity-60 font-medium max-w-[160px] mx-auto uppercase tracking-tighter">Select a search result to view details and metadata.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="p-3 border-t bg-muted/40 text-[10px] text-muted-foreground flex justify-between px-6 font-mono font-bold">
                <div className="flex gap-6 items-center">
                    <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", searching ? "bg-green-500 animate-ping" : "bg-muted-foreground/30")} />
                        {searching ? "STATUS: SCANNING..." : "STATUS: READY"}
                    </div>
                    <span>RESULTS: {results.length}</span>
                    {selectedResultIndex >= 0 && (
                        <span className="text-primary underline decoration-2 underline-offset-4">FOCUS: {selectedResultIndex + 1}</span>
                    )}
                </div>
                {searching && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-3 font-black text-destructive hover:bg-destructive/10"
                        onClick={cancelSearch}
                    >
                        [ CANCEL SEARCH ]
                    </Button>
                )}
            </div>
        </div>
    );
};
