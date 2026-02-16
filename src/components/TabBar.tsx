import React from "react";
import { useExplorerStore } from "@/stores/explorerStore";
import { cn } from "@/lib/utils";
import { X, File, Folder, Search, CopyCheck } from "lucide-react";

export const TabBar = () => {
    const { tabs, activeTabId, setActiveTab, closeTab } = useExplorerStore();

    const getIcon = (type: string) => {
        switch (type) {
            case "explorer": return <Folder className="w-3.5 h-3.5" />;
            case "duplicates": return <CopyCheck className="w-3.5 h-3.5 text-primary" />;
            case "search": return <Search className="w-3.5 h-3.5" />;
            default: return <File className="w-3.5 h-3.5" />;
        }
    };

    const handleMouseUp = (e: React.MouseEvent, id: string) => {
        // Middle click = close
        if (e.button === 1) {
            e.preventDefault();
            closeTab(id);
        }
    };

    return (
        <div className="flex items-center bg-muted/30 border-b overflow-x-auto no-scrollbar h-10 px-2 gap-1 select-none">
            {tabs.map((tab) => {
                const isActive = activeTabId === tab.id;
                return (
                    <div
                        key={tab.id}
                        onMouseUp={(e) => handleMouseUp(e, tab.id)}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            "group relative flex items-center h-[34px] min-w-[120px] max-w-[200px] px-3 gap-2 rounded-t-lg transition-all cursor-pointer border-x border-t border-transparent",
                            isActive
                                ? "bg-background border-border shadow-[0_-2px_8px_rgba(0,0,0,0.05)] z-10"
                                : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <span className={cn(
                            "flex-shrink-0 transition-transform duration-200",
                            isActive ? "scale-110" : "grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100"
                        )}>
                            {getIcon(tab.type)}
                        </span>

                        <span className="flex-1 text-[11px] font-bold truncate">
                            {tab.title}
                        </span>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                closeTab(tab.id);
                            }}
                            className={cn(
                                "flex-shrink-0 p-0.5 rounded-md hover:bg-muted-foreground/20 transition-all opacity-0 group-hover:opacity-100 active:scale-95",
                                isActive && "opacity-100" // Keep visible on active tab for convenience, or strictly hover per user requirement
                            )}
                        >
                            <X className="w-3 h-3" />
                        </button>

                        {/* Bottom line for active tab to blend with content area */}
                        {isActive && (
                            <div className="absolute -bottom-[1px] left-0 right-0 h-[1px] bg-background z-20" />
                        )}
                    </div>
                );
            })}
        </div>
    );
};
