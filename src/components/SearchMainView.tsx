import { useRef, useEffect, useState, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, FileText, Loader2, X, ExternalLink, ListPlus, ListMinus, FolderInput, Play } from "lucide-react";
import { useExplorerStore } from "@/stores/explorerStore";
import { FileEntry, SearchResult } from "@/types/explorer";
import { useSidebarStore } from "@/stores/sidebarStore";
import { useDeleteQueueStore } from "@/stores/deleteQueueStore";
import { useMoveQueueStore } from "@/stores/moveQueueStore";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { SearchBreadcrumbs } from "./search/SearchBreadcrumbs";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { homeDir } from "@tauri-apps/api/path";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    SelectGroup,
    SelectLabel
} from "@/components/ui/select";
import { FilePreviewContent } from "./FilePreviewContent";
import { cn } from "@/lib/utils";
import { SearchResultRow } from "./search/SearchResultRow";

const ROW_ESTIMATE = 52;
const OVERCAN = 12;
const BATCH_FLUSH_MS = 120;
const BATCH_FLUSH_SIZE = 80;

interface SearchMainViewProps {
    isTab?: boolean;
    tabId?: string;
    initialQuery?: string;
    initialResults?: SearchResult[];
    initialVolume?: string;
    onClose?: () => void;
    onKeepTab?: (results: SearchResult[], query: string) => void;
}

export const SearchMainView = ({
    tabId,
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
    const [searchId, setSearchId] = useState<string | null>(null);

    const [searchType, setSearchType] = useState<"file" | "content">("file");
    const [itemType, setItemType] = useState<string>("both");
    const [selectedVolume, setSelectedVolume] = useState<string>(initialVolume || activeTab?.path || "/");
    const [maxDepth, setMaxDepth] = useState<number | "">("");
    const [resultLimit, setResultLimit] = useState<number | "">("");

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
        if (searchId) {
            await invoke("cancel_operation", { operation_id: searchId });
            setSearching(false);
            setSearchId(null);
        }
    }, [searchId]);

    const startSearch = async () => {
        if (!query) return;
        await cancelSearch();

        const newSearchId = crypto.randomUUID();
        setSearchId(newSearchId);
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

        const unlisten = await listen<SearchResult>("search_result", (event) => {
            buffer.push(event.payload);
            if (buffer.length >= BATCH_FLUSH_SIZE) {
                flush();
            } else if (!flushTimer) {
                flushTimer = setTimeout(flush, BATCH_FLUSH_MS);
            }
        });

        const unlistenCompleted = await listen<string>("search_completed", (event) => {
            if (event.payload === newSearchId) {
                flush();
                setSearching(false);
                unlisten();
                unlistenCompleted();
            }
        });

        const searchOptions = {
            maxDepth: maxDepth === "" ? undefined : (maxDepth === 0 ? 1 : Number(maxDepth)),
            resultLimit: resultLimit === "" ? undefined : Number(resultLimit) || undefined,
            itemType: itemType,
        };

        const cmd = searchType === "file" ? "start_file_search" : "start_content_search";

        await invoke(cmd, {
            searchId: newSearchId,
            root: selectedVolume,
            pattern: query,
            ...searchOptions
        });
    };

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
            if (searchId) invoke("cancel_operation", { operation_id: searchId }).catch(() => { });
        };
    }, [searchId]);

    // Keep selected move queue valid
    useEffect(() => {
        if (moveQueues.length === 0) setSelectedMoveQueueId("");
        else if (!selectedMoveQueueId || !moveQueues.some((q) => q.id === selectedMoveQueueId))
            setSelectedMoveQueueId(moveQueues[0].id);
    }, [moveQueues, selectedMoveQueueId]);

    return (
        <div className="flex-1 flex flex-col overflow-hidden outline-none bg-background/95">
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
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-2 h-10">
                        <div className="flex flex-col gap-1">
                            <label className="text-[9px] text-muted-foreground text-center">Depth</label>
                            <Input
                                type="number"
                                min={0}
                                placeholder="all"
                                className="w-14 h-7 text-[11px] text-center"
                                value={maxDepth === "" ? "" : maxDepth}
                                onChange={(e) => setMaxDepth(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value, 10) || 0))}
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[9px] text-muted-foreground text-center">Limit</label>
                            <Input
                                type="number"
                                min={1}
                                placeholder="10k"
                                className="w-14 h-7 text-[11px] text-center"
                                value={resultLimit === "" ? "" : resultLimit}
                                onChange={(e) => setResultLimit(e.target.value === "" ? "" : Math.max(1, parseInt(e.target.value, 10) || 1))}
                            />
                        </div>
                    </div>

                    <Button
                        className="h-8 px-5 text-xs font-bold shadow-lg shadow-primary/20 transition-all"
                        onClick={startSearch}
                        disabled={searching}
                    >
                        {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Search className="w-3.5 h-3.5 mr-2" /> Search</>}
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
            {isTab && tabId && (
                <div className="px-4 py-1 border-b bg-muted/20 flex items-center justify-between">
                    <Breadcrumbs tabId={tabId} />
                </div>
            )}

            <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Left: Results List (Main Area) */}
                <div className="flex-1 border-r flex flex-col relative bg-muted/5 min-w-0">
                    {/* Header for results with breadcrumbs */}
                    {isTab && (
                        <div className="px-4 py-2 border-b bg-muted/10 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Search className="w-3.5 h-3.5 text-primary/70" />
                                <span className="text-[10px] uppercase font-black tracking-tighter opacity-70">Results Overview</span>
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
                <div className="flex-1 bg-background flex flex-col relative overflow-hidden">
                    {selectedResult ? (
                        <div className="flex-1 flex overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            {/* Central Preview Content */}
                            <div className="flex-1 flex flex-col bg-muted/20 relative group/preview border-r">
                                <div className="flex-1 min-h-0 flex items-center justify-center bg-muted/30">
                                    <FilePreviewContent
                                        path={selectedResult.path}
                                        extension={selectedResult.name.split('.').pop() || ""}
                                        name={selectedResult.name}
                                        is_dir={selectedResult.is_dir}
                                        section="content_search"
                                    />
                                </div>
                            </div>

                            {/* Standard Metadata Sidebar (Right) */}
                            <div className="w-[300px] flex flex-col bg-muted/5 overflow-hidden">
                                <div className="p-4 border-b bg-muted/20">
                                    <div className="flex flex-col gap-1.5 min-w-0">
                                        <span className="text-[9px] uppercase text-muted-foreground font-black tracking-widest">Selected Item</span>
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
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 text-[10px] font-bold gap-1.5"
                                                onClick={() => handleOpenInFinder(selectedResult.path)}
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                                REVEAL
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 text-[10px] font-bold gap-1.5 text-primary"
                                                onClick={() => handleOpenItem(selectedResult.path)}
                                            >
                                                <Play className="w-3.5 h-3.5" />
                                                OPEN
                                            </Button>
                                        </div>

                                        <div className="space-y-2">
                                            <Button
                                                variant={isInDeleteQueue ? "destructive" : "outline"}
                                                size="sm"
                                                className={cn(
                                                    "w-full h-9 text-[11px] font-bold gap-2 justify-start px-4",
                                                    isInDeleteQueue && "bg-destructive/10 border-destructive/30 text-destructive"
                                                )}
                                                onClick={handleToggleDelete}
                                            >
                                                {isInDeleteQueue ? <ListMinus className="w-4 h-4" /> : <ListPlus className="w-4 h-4" />}
                                                {isInDeleteQueue ? "Queue Delete" : "Queue Delete"}
                                            </Button>

                                            <div className="space-y-2">
                                                <Button
                                                    variant={isInMoveQueue ? "default" : "outline"}
                                                    size="sm"
                                                    className={cn(
                                                        "w-full h-9 text-[11px] font-bold gap-2 justify-start px-4",
                                                        isInMoveQueue && "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                                                    )}
                                                    onClick={handleToggleMove}
                                                    disabled={!selectedMoveQueueId && !isInMoveQueue}
                                                >
                                                    {isInMoveQueue ? <ListMinus className="w-4 h-4" /> : <FolderInput className="w-4 h-4" />}
                                                    {isInMoveQueue ? "Queue Move" : "Queue Move"}
                                                </Button>
                                                {!isInMoveQueue && moveQueues.length > 0 && (
                                                    <div className="px-1">
                                                        <Select value={selectedMoveQueueId} onValueChange={setSelectedMoveQueueId}>
                                                            <SelectTrigger className="w-full h-8 text-[10px] bg-background">
                                                                <SelectValue placeholder="To Queue" />
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
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Detailed Metadata */}
                                    <div className="space-y-4 pt-4 border-t">
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-[9px] uppercase text-muted-foreground font-black tracking-widest">Direct Path</span>
                                            <span
                                                className="text-[10px] break-all font-mono opacity-80 bg-muted/30 p-2.5 rounded border border-muted-foreground/10 leading-relaxed cursor-pointer hover:bg-muted/50 transition-colors"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(selectedResult.path);
                                                    toast.success("Path copied to clipboard");
                                                }}
                                            >
                                                {selectedResult.path}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 pt-2">
                                            <div className="p-2 rounded bg-muted/20 border border-muted-foreground/5 flex flex-col items-center">
                                                <span className="text-[8px] uppercase text-muted-foreground font-bold">Size</span>
                                                <span className="text-[10px] font-mono font-bold mt-1">
                                                    {selectedResult.size !== null ? `${Math.round(selectedResult.size / 1024)} KB` : "N/A"}
                                                </span>
                                            </div>
                                            <div className="p-2 rounded bg-muted/20 border border-muted-foreground/5 flex flex-col items-center">
                                                <span className="text-[8px] uppercase text-muted-foreground font-bold">Type</span>
                                                <span className="text-[10px] font-mono font-bold mt-1 uppercase">
                                                    {selectedResult.is_dir ? "Folder" : (selectedResult.name.split('.').pop() || "File")}
                                                </span>
                                            </div>
                                            {selectedResult.line_number !== undefined && (
                                                <div className="col-span-2 p-2 rounded bg-primary/5 border border-primary/20 flex flex-col items-center">
                                                    <span className="text-[8px] uppercase text-primary font-bold">Matching Line</span>
                                                    <span className="text-[10px] font-mono font-bold mt-1 text-primary">Row {selectedResult.line_number}</span>
                                                </div>
                                            )}
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
