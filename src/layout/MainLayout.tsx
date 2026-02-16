import { useEffect, useState } from "react";
import { FilePanel } from "@/panels/FilePanel";
import { useExplorerStore } from "@/stores/explorerStore";
import { SearchDialog } from "@/components/SearchDialog";
import { Button } from "@/components/ui/button";
import { Search, Sun, Moon, Settings, Keyboard, Menu, CopyCheck, Plus } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { PreviewModal } from "@/components/PreviewModal";
import { Sidebar } from "@/components/Sidebar";
import { StatusBar } from "@/components/StatusBar";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useSidebarStore } from "@/stores/sidebarStore";
import { useListStore } from "@/stores/listStore";
import { cn } from "@/lib/utils";
import { ListTray } from "@/components/ListTray";
import { WelcomePage } from "@/components/WelcomePage";
import { DuplicateTab } from "@/components/DuplicateTab";
import { TabBar } from "@/components/TabBar";

export const MainLayout = () => {
    const tabs = useExplorerStore((state) => state.tabs);
    const addTab = useExplorerStore((state) => state.addTab);
    const activeTabId = useExplorerStore((state) => state.activeTabId);
    const activeView = useExplorerStore((state) => state.activeView);
    const setActiveView = useExplorerStore((state) => state.setActiveView);
    const closeTab = useExplorerStore((state) => state.closeTab);

    const { theme, setTheme } = useTheme();
    const { toggleSidebar } = useSidebarStore();
    const { items } = useListStore();

    const [searchOpen, setSearchOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [trayOpen, setTrayOpen] = useState(false);


    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey)) return;

            switch (e.key.toLowerCase()) {
                case "f":
                    e.preventDefault();
                    setSearchOpen(true);
                    break;
                case "b":
                    e.preventDefault();
                    toggleSidebar();
                    break;
                case ",":
                    e.preventDefault();
                    setSettingsOpen(true);
                    break;
                case "w":
                    e.preventDefault();
                    if (activeView === "explorer" && activeTabId) {
                        closeTab(activeTabId);
                    } else if (activeView === "dedupe") {
                        setActiveView("explorer");
                    }
                    break;
                case "n":
                    e.preventDefault();
                    if (e.shiftKey) {
                        // Trigger new folder logic if a tab is active
                        // This would ideally emit an event to the active FilePanel
                    } else {
                        addTab("/");
                    }
                    break;
                case "1":
                    e.preventDefault();
                    setActiveView("explorer");
                    break;
                case "2":
                    e.preventDefault();
                    setActiveView("dedupe");
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [toggleSidebar, activeTabId, closeTab, addTab]);

    return (
        <div className="flex flex-col h-screen w-full bg-background overflow-hidden text-foreground">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-muted/20 border-b">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        onClick={toggleSidebar}
                    >
                        <Menu className="w-4 h-4" />
                    </Button>
                    <div className="flex items-center gap-2">
                        <h1 className="text-sm font-bold tracking-tight">SuperExplorer</h1>
                        <div className="hidden sm:flex items-center gap-1 bg-muted/50 rounded-md px-2 py-0.5 border border-border/50">
                            <Keyboard className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">
                                ⌘F Search
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 gap-2 text-xs font-bold text-primary hover:bg-primary/10"
                        onClick={() => addTab("/", "duplicates")}
                    >
                        <CopyCheck className="h-4 w-4" />
                        Find Duplicates
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => addTab("/Users/rajantiwari")}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>

                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSearchOpen(true)}>
                        <Search className="h-4 w-4" />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    >
                        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </Button>

                    <Button variant="ghost" size="icon" className="h-8 w-8 relative" onClick={() => setTrayOpen(!trayOpen)}>
                        <Menu className="h-4 w-4" />
                        {items.length > 0 && (
                            <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full ring-2 ring-background" />
                        )}
                    </Button>

                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSettingsOpen(true)}>
                        <Settings className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden">
                <Sidebar />

                <div className="flex-1 flex flex-col overflow-hidden">
                    {activeView === "explorer" ? (
                        <>
                            <TabBar />
                            <div className="flex-1 relative overflow-hidden bg-background">
                                {tabs.length > 0 ? (
                                    tabs.map((tab) => (
                                        <div
                                            key={tab.id}
                                            className={cn(
                                                "absolute inset-0 transition-opacity duration-200",
                                                activeTabId === tab.id ? "opacity-100 z-10" : "opacity-0 pointer-events-none z-0"
                                            )}
                                        >
                                            {tab.type === "explorer" && <FilePanel tabId={tab.id} />}
                                            {tab.type === "duplicates" && <DuplicateTab tabId={tab.id} />}
                                        </div>
                                    ))
                                ) : (
                                    <WelcomePage />
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 p-4 overflow-hidden bg-background">
                            <DuplicateTab tabId="dedupe-service" />
                        </div>
                    )}
                </div>

                <ListTray open={trayOpen} onClose={() => setTrayOpen(false)} />
            </div>

            {/* Bottom Status Bar */}
            <StatusBar />

            <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
            <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
            <PreviewModal />
        </div>
    );
};
