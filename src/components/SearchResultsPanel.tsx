import { useExplorerStore } from "@/stores/explorerStore";
import { SearchMainView } from "./SearchMainView";
import { SearchResult } from "@/types/explorer";

interface SearchResultsPanelProps {
    tabId: string;
}

export function SearchResultsPanel({ tabId }: SearchResultsPanelProps) {
    const tab = useExplorerStore((state) => state.tabs.find((t) => t.id === tabId));

    if (!tab) return null;

    // Extract query from path search://${query}
    const query = tab.path.startsWith("search://") ? tab.path.slice(9) : "";
    const results = (tab.entries || []) as SearchResult[];

    return (
        <SearchMainView
            isTab={true}
            tabId={tabId}
            initialQuery={query}
            initialResults={results}
            initialVolume={tab.path.startsWith("search://") ? undefined : tab.path} // Default to root or tab path
        />
    );
}
