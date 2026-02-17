import { useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, FileText, Folder, Loader2, X } from "lucide-react";
import { useSearchStore } from "@/stores/searchStore";
import { useExplorerStore } from "@/stores/explorerStore";
import { SearchResult as SearchResultType } from "@/types/explorer";

const ROW_ESTIMATE = 56;
const OVERCAN = 12;

function SearchResultRow({
    result,
    style,
}: {
    result: SearchResultType;
    style: React.CSSProperties;
}) {
    return (
        <div
            style={style}
            className="flex flex-col p-2 hover:bg-accent rounded-md cursor-pointer group transition-colors absolute top-0 left-0 w-full"
        >
            <div className="flex items-center gap-2">
                {result.is_dir ? (
                    <Folder className="w-4 h-4 text-blue-400 fill-blue-400/20 shrink-0" />
                ) : (
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <span className="text-sm font-medium truncate">{result.name}</span>
                {result.line_number !== undefined && (
                    <span className="text-xs text-muted-foreground font-mono bg-muted px-1 rounded shrink-0">
                        L{result.line_number}
                    </span>
                )}
            </div>
            <div className="text-xs text-muted-foreground truncate pl-6">
                {result.path}
            </div>
            {result.preview && (
                <div className="text-xs bg-muted/30 p-2 mt-1 rounded pl-2 truncate font-mono border-l-2 border-primary/50 ml-6 italic">
                    {result.preview}
                </div>
            )}
        </div>
    );
}

export const SearchDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
    const results = useSearchStore((state) => state.results);
    const searching = useSearchStore((state) => state.searching);
    const startFileSearch = useSearchStore((state) => state.startFileSearch);
    const startContentSearch = useSearchStore((state) => state.startContentSearch);
    const cancelSearch = useSearchStore((state) => state.cancelSearch);

    const tabs = useExplorerStore((state) => state.tabs);
    const activeTabId = useExplorerStore((state) => state.activeTabId);
    const [query, setQuery] = useState("");
    const [searchType, setSearchType] = useState<"file" | "content">("file");
    const [maxDepth, setMaxDepth] = useState<number | "">("");
    const [resultLimit, setResultLimit] = useState<number | "">("");

    const parentRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
        count: results.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => ROW_ESTIMATE,
        overscan: OVERCAN,
    });

    useEffect(() => {
        virtualizer.measure();
    }, [results.length, virtualizer]);

    const activeTab = tabs.find((t) => t.id === activeTabId);
    const currentPath = activeTab?.path || "/";

    const searchOptions = {
        max_depth: maxDepth === "" ? undefined : (maxDepth === 0 ? 1 : Number(maxDepth)),
        result_limit: resultLimit === "" ? undefined : Number(resultLimit) || undefined,
    };

    const handleSearch = () => {
        if (!query) return;
        if (searchType === "file") {
            startFileSearch(currentPath, query, searchOptions);
        } else {
            startContentSearch(currentPath, query, searchOptions);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o) cancelSearch();
                onOpenChange(o);
            }}
        >
            <DialogContent className="sm:max-w-[600px] h-[500px] flex flex-col p-0 overflow-hidden outline-none">
                <DialogHeader className="p-4 pb-2">
                    <DialogTitle className="flex items-center gap-2">
                        <Search className="w-5 h-5 text-primary" />
                        Search in {currentPath}
                    </DialogTitle>
                </DialogHeader>

                <div className="px-4 py-2 flex flex-wrap gap-2 items-end">
                    <div className="relative flex-1 min-w-[180px]">
                        <Input
                            value={query}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                            placeholder={searchType === "file" ? "Search by filename..." : "Search in file content..."}
                            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && handleSearch()}
                            className="pr-8"
                        />
                        {query && (
                            <X
                                className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                                onClick={() => setQuery("")}
                            />
                        )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <div className="flex items-center gap-1">
                            <label className="text-[10px] text-muted-foreground whitespace-nowrap">Depth</label>
                            <Input
                                type="number"
                                min={0}
                                placeholder="all"
                                className="w-16 h-8 text-xs"
                                value={maxDepth === "" ? "" : maxDepth}
                                onChange={(e) => setMaxDepth(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value, 10) || 0))}
                            />
                        </div>
                        <div className="flex items-center gap-1">
                            <label className="text-[10px] text-muted-foreground whitespace-nowrap">Max</label>
                            <Input
                                type="number"
                                min={1}
                                placeholder="10k"
                                className="w-16 h-8 text-xs"
                                value={resultLimit === "" ? "" : resultLimit}
                                onChange={(e) => setResultLimit(e.target.value === "" ? "" : Math.max(1, parseInt(e.target.value, 10) || 1))}
                            />
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setSearchType(searchType === "file" ? "content" : "file")}>
                            {searchType === "file" ? "Filename" : "Grep"}
                        </Button>
                        <Button onClick={handleSearch} disabled={searching}>
                            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                        </Button>
                    </div>
                </div>

                <div ref={parentRef} className="flex-1 overflow-auto border-t min-h-0">
                    {results.length === 0 && !searching && query && (
                        <div className="p-8 text-center text-muted-foreground text-sm">
                            No results found for &quot;{query}&quot;
                        </div>
                    )}
                    {results.length > 0 && (
                        <div
                            style={{ height: virtualizer.getTotalSize(), position: "relative" }}
                            className="p-2"
                        >
                            {virtualizer.getVirtualItems().map((virtualRow) => {
                                const result = results[virtualRow.index];
                                if (!result) return null;
                                return (
                                    <SearchResultRow
                                        key={`${result.path}-${virtualRow.index}`}
                                        result={result}
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
                        <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            <p className="text-sm">Searching filesystem...</p>
                        </div>
                    )}
                </div>

                <div className="p-2 border-t bg-muted/10 text-[10px] text-muted-foreground flex justify-between px-4">
                    <span>Found {results.length} matches</span>
                    {searching && <span className="animate-pulse">Searching...</span>}
                </div>
            </DialogContent>
        </Dialog>
    );
};
