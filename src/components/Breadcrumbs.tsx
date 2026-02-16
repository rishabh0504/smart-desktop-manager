import React from "react";
import { ChevronRight, Home } from "lucide-react";
import { useExplorerStore } from "@/stores/explorerStore";
import { cn } from "@/lib/utils";

interface BreadcrumbsProps {
    tabId: string; // changed from panel
}

export const Breadcrumbs = ({ tabId }: BreadcrumbsProps) => {
    const tab = useExplorerStore((state) => state.tabs.find((t) => t.id === tabId));
    const setPath = useExplorerStore((state) => state.setPath);

    if (!tab) return null;

    const path = tab.path;

    // Handle both Windows (\) and Unix (/) paths
    const separator = path.includes("\\") ? "\\" : "/";
    const parts = path.split(separator).filter(Boolean);

    // Reconstruct paths for each part
    const crumbs = parts.map((part, index) => {
        const fullPath = (path.startsWith('/') || path.startsWith('\\') ? separator : '') + parts.slice(0, index + 1).join(separator);
        return { name: part, path: fullPath };
    });

    return (
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1 text-[11px] h-8 font-medium text-muted-foreground">
            <div
                className="p-1 hover:bg-accent hover:text-foreground rounded cursor-pointer flex-shrink-0"
                onClick={() => setPath(tabId, separator)} // home for tab
            >
                <Home className="w-3.5 h-3.5" />
            </div>

            {crumbs.map((crumb, i) => (
                <React.Fragment key={crumb.path}>
                    <ChevronRight className="w-3 h-3 opacity-30 flex-shrink-0" />
                    <div
                        className={cn(
                            "px-1.5 py-0.5 hover:bg-accent hover:text-foreground rounded cursor-pointer whitespace-nowrap",
                            i === crumbs.length - 1 && "text-foreground font-semibold"
                        )}
                        onClick={() => setPath(tabId, crumb.path)}
                    >
                        {crumb.name}
                    </div>
                </React.Fragment>
            ))}
        </div>
    );
};
