import { useState } from "react";
import { 
    X, 
    Shield, 
    Eye, 
    EyeOff, 
    Check, 
    Palette, 
    FileSearch, 
    FileText,
    ScanSearch, 
    Plus, 
    LayoutGrid, 
    Settings2, 
    MonitorDot,
    Monitor as MonitorIcon, 
    Lock, 
    Image, 
    Video, 
    Music, 
    BookOpen, 
    Archive,
    Search,
    Eraser
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfigSection } from "@/types/explorer";

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const SETTINGS_TAB_LABELS: Record<"explorer" | "dedupe" | "search" | "clean" | "theme", string> = {
    explorer: "Explorer",
    dedupe: "Deduplication",
    search: "Content Search",
    clean: "Cleaner",
    theme: "Appearance",
};

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
    const { settings, updateSettings, updatePreviewSettings, addBlockedExtension, removeBlockedExtension, addBlockedName, removeBlockedName, updateTheme } = useSettingsStore();
    const [activeTab, setActiveTab] = useState<"explorer" | "dedupe" | "search" | "clean" | "theme">("explorer");

    if (!open) return null;

    const tabs = [
        { id: "explorer", label: "Explorer", icon: <LayoutGrid className="w-4 h-4" /> },
        { id: "dedupe", label: "Deduplication", icon: <ScanSearch className="w-4 h-4" /> },
        { id: "search", label: "Content Search", icon: <Search className="w-4 h-4" /> },
        { id: "clean", label: "Cleaner", icon: <Eraser className="w-4 h-4" /> },
        { id: "theme", label: "Appearance", icon: <Palette className="w-4 h-4" /> },
    ];

    const currentSectionSettings = activeTab !== "theme" 
        ? settings[activeTab === "search" ? "content_search" : activeTab] 
        : null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-background/80 backdrop-blur-md animate-in fade-in duration-300 pointer-events-auto"
                onClick={() => onOpenChange(false)}
            />
            <div className="relative w-full max-w-4xl h-[650px] bg-card border border-border shadow-2xl rounded-2xl flex overflow-hidden animate-in zoom-in-95 duration-300 pointer-events-auto">
                {/* Sidebar */}
                <div className="w-64 bg-muted/30 border-r border-border/50 flex flex-col">
                    <div className="p-6 border-b border-border/50">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                                <Settings2 className="w-4 h-4" />
                            </div>
                            <h2 className="text-sm font-bold tracking-tight">SDM Settings</h2>
                        </div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium opacity-60">Control Center</p>
                    </div>

                    <nav className="flex-1 p-3 space-y-1">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all group relative",
                                    activeTab === tab.id
                                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-[1.02]"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                            >
                                <span className={cn(
                                    "transition-transform duration-200",
                                    activeTab === tab.id ? "scale-110" : "group-hover:scale-110"
                                )}>{tab.icon}</span>
                                {tab.label}
                                {activeTab === tab.id && (
                                    <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-primary-foreground/40 animate-pulse" />
                                )}
                            </button>
                        ))}
                    </nav>

                    <div className="p-4 border-t border-border/50 bg-muted/20 space-y-3">
                        <button
                            onClick={() => {
                                if (confirm("Are you sure you want to reset all settings to defaults?")) {
                                    (useSettingsStore.getState() as any).resetSettings();
                                }
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all border border-transparent hover:border-destructive/20"
                        >
                            <Eraser className="w-3.5 h-3.5" />
                            Reset to Defaults
                        </button>
                        
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-background/50 border border-border/50">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <MonitorDot className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <p className="text-[11px] font-bold truncate">System Active</p>
                                <p className="text-[9px] text-muted-foreground truncate uppercase font-medium">V2.4.0 High-Performance</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-col min-w-0 bg-card/50">
                    <header className="h-[72px] px-8 border-b border-border/50 flex items-center justify-between bg-card/50 backdrop-blur-sm">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold">{SETTINGS_TAB_LABELS[activeTab]}</span>
                                <div className="h-1 w-1 rounded-full bg-primary/40" />
                                <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Parameters</span>
                            </div>
                        </div>
                        <button
                            onClick={() => onOpenChange(false)}
                            className="p-2 rounded-xl hover:bg-muted text-muted-foreground transition-all duration-200 hover:rotate-90 hover:scale-110"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </header>

                    <ScrollArea className="flex-1">
                        <div className="p-10 max-w-2xl mx-auto">
                            {activeTab === "theme" ? (
                                <ThemeSettingsView settings={settings.theme} onUpdate={updateTheme} />
                            ) : (
                                <ConfigSectionView
                                    section={activeTab === "search" ? "content_search" : activeTab}
                                    settings={currentSectionSettings as ConfigSection}
                                    updateSettings={updateSettings}
                                    updatePreviewSettings={updatePreviewSettings}
                                    addBlockedExtension={addBlockedExtension}
                                    removeBlockedExtension={removeBlockedExtension}
                                    addBlockedName={addBlockedName}
                                    removeBlockedName={removeBlockedName}
                                />
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </div>
        </div>
    );
}

function ThemeSettingsView({ settings, onUpdate }: { settings: any, onUpdate: any }) {
    return (
        <div className="space-y-8">
            <section className="space-y-6">
                <div>
                    <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
                        <MonitorIcon className="w-4 h-4 text-primary" /> Appearance
                    </h3>
                    <p className="text-[11px] text-muted-foreground">Customize how the application looks.</p>
                </div>

                <div className="grid gap-4">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-muted/40 border border-border/50">
                        <div className="space-y-0.5">
                            <span className="text-[13px] font-medium">Custom Brand Color</span>
                            <p className="text-[11px] text-muted-foreground">Override the default primary color.</p>
                        </div>
                        <button
                            onClick={() => onUpdate({ use_custom_color: !settings.use_custom_color })}
                            className={cn(
                                "relative w-11 h-6 rounded-full transition-colors duration-200 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-primary",
                                settings.use_custom_color ? "bg-primary" : "bg-muted-foreground/30"
                            )}
                        >
                            <span className={cn(
                                "absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 flex items-center justify-center",
                                settings.use_custom_color && "translate-x-5"
                            )}>
                                {settings.use_custom_color && <Check className="w-3 h-3 text-primary" />}
                            </span>
                        </button>
                    </div>

                    {settings.use_custom_color && (
                        <div className="p-4 rounded-xl bg-muted/40 border border-border/50 animate-in zoom-in-95 duration-200">
                            <label className="text-[13px] font-medium mb-3 block">Primary Hex Color</label>
                            <div className="flex gap-4 items-center">
                                <div className="relative group">
                                    <input
                                        type="color"
                                        value={settings.custom_color}
                                        onChange={(e) => onUpdate({ custom_color: e.target.value })}
                                        className="w-12 h-12 rounded-lg cursor-pointer bg-transparent border-none p-0 overflow-hidden"
                                    />
                                    <div className="absolute inset-0 rounded-lg ring-2 ring-primary/20 pointer-events-none group-hover:ring-primary/40 transition-all" />
                                </div>
                                <div className="flex-1 space-y-1.5">
                                    <Input
                                        value={settings.custom_color}
                                        onChange={(e) => onUpdate({ custom_color: e.target.value })}
                                        className="h-9 text-xs font-mono uppercase tracking-wider"
                                        placeholder="#000000"
                                    />
                                    <div className="flex gap-1.5">
                                        {['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'].map((c) => (
                                            <button
                                                key={c}
                                                onClick={() => onUpdate({ custom_color: c })}
                                                className={cn(
                                                    "w-5 h-5 rounded-full border-2 transition-transform hover:scale-110",
                                                    settings.custom_color === c ? "border-foreground scale-110" : "border-transparent"
                                                )}
                                                style={{ backgroundColor: c }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}

function ConfigSectionView({ 
    section, 
    settings, 
    updateSettings, 
    updatePreviewSettings,
    addBlockedExtension,
    removeBlockedExtension,
    addBlockedName,
    removeBlockedName
}: {
    section: "explorer" | "dedupe" | "content_search" | "clean",
    settings: ConfigSection,
    updateSettings: any,
    updatePreviewSettings: any,
    addBlockedExtension: any,
    removeBlockedExtension: any,
    addBlockedName: any,
    removeBlockedName: any
}) {
    const [newExt, setNewExt] = useState("");
    const [newName, setNewName] = useState("");

    return (
        <div className="space-y-10">
            {/* Visibility Settings */}
            <section className="space-y-6">
                <div>
                    <h3 className="text-sm font-semibold mb-1 flex items-center gap-2 text-primary">
                        <Eye className="w-4 h-4" /> Visibility
                    </h3>
                    <p className="text-[11px] text-muted-foreground italic">Toggle visibility for specific file attributes.</p>
                </div>

                <div className="grid gap-3">
                    <button
                        onClick={() => updateSettings(section, { show_hidden_files: !settings.show_hidden_files })}
                        className={cn(
                            "flex items-center justify-between p-4 rounded-xl border transition-all duration-200 group text-left",
                            settings.show_hidden_files
                                ? "bg-primary/5 border-primary/30 ring-1 ring-primary/10 shadow-sm"
                                : "bg-muted/30 border-border/50 hover:bg-muted/50"
                        )}
                    >
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "p-2.5 rounded-lg border transition-colors",
                                settings.show_hidden_files ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border"
                            )}>
                                {settings.show_hidden_files ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </div>
                            <div className="space-y-0.5">
                                <span className="text-[13px] font-semibold">Hidden Files</span>
                                <p className="text-[11px] text-muted-foreground">Show files that start with a dot (e.g. .env, .git)</p>
                            </div>
                        </div>
                    </button>

                    <button
                        onClick={() => updateSettings(section, { show_system_files: !settings.show_system_files })}
                        className={cn(
                            "flex items-center justify-between p-4 rounded-xl border transition-all duration-200 group text-left",
                            settings.show_system_files
                                ? "bg-primary/5 border-primary/30 ring-1 ring-primary/10 shadow-sm"
                                : "bg-muted/30 border-border/50 hover:bg-muted/50"
                        )}
                    >
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "p-2.5 rounded-lg border transition-colors",
                                settings.show_system_files ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border"
                            )}>
                                <Shield className={cn("w-4 h-4", settings.show_system_files ? "" : "opacity-70")} />
                            </div>
                            <div className="space-y-0.5">
                                <span className="text-[13px] font-semibold">System Paths</span>
                                <p className="text-[11px] text-muted-foreground">Access OS-specific protected locations (High Risk)</p>
                            </div>
                        </div>
                    </button>
                </div>
            </section>

            {/* Allowed Scopes */}
            <section className="space-y-6">
                <div>
                    <h3 className="text-sm font-semibold mb-1 flex items-center gap-2 text-primary">
                        <FileSearch className="w-4 h-4" /> Allowed Scope
                    </h3>
                    <p className="text-[11px] text-muted-foreground italic">
                        {section === "dedupe"
                            ? "Which categories are included when scanning for duplicates (and preview)."
                            : "Choose which file types to recognize."}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <PreviewToggle
                        label="Images"
                        icon={<Image className="w-4 h-4" />}
                        active={settings.preview_enabled.image}
                        onClick={() => updatePreviewSettings(section, { image: !settings.preview_enabled.image })}
                    />
                    <PreviewToggle
                        label="Video"
                        icon={<Video className="w-4 h-4" />}
                        active={settings.preview_enabled.video}
                        onClick={() => updatePreviewSettings(section, { video: !settings.preview_enabled.video })}
                    />
                    <PreviewToggle
                        label="Audio"
                        icon={<Music className="w-4 h-4" />}
                        active={settings.preview_enabled.audio}
                        onClick={() => updatePreviewSettings(section, { audio: !settings.preview_enabled.audio })}
                    />
                    <PreviewToggle
                        label="Documents"
                        icon={<BookOpen className="w-4 h-4" />}
                        active={settings.preview_enabled.document}
                        onClick={() => updatePreviewSettings(section, { document: !settings.preview_enabled.document })}
                    />
                    <PreviewToggle
                        label="Compressed"
                        icon={<Archive className="w-4 h-4" />}
                        active={settings.preview_enabled.archive}
                        onClick={() => updatePreviewSettings(section, { archive: !settings.preview_enabled.archive })}
                    />
                </div>
            </section>

            {section === "dedupe" && (
                <section className="space-y-6">
                    <div>
                        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2 text-primary">
                            <ScanSearch className="w-4 h-4" /> Plain text in duplicate scan
                        </h3>
                        <p className="text-[11px] text-muted-foreground italic">
                            When off (default), .txt, .md, code, JSON, and similar types are skipped in duplicate scans only—usually small on disk.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() =>
                            updateSettings(section, {
                                include_plain_text_in_duplicate_scan: !(settings.include_plain_text_in_duplicate_scan ?? false),
                            })
                        }
                        className={cn(
                            "flex items-center justify-between w-full p-4 rounded-xl border transition-all duration-200 group text-left",
                            settings.include_plain_text_in_duplicate_scan
                                ? "bg-primary/5 border-primary/30 ring-1 ring-primary/10 shadow-sm"
                                : "bg-muted/30 border-border/50 hover:bg-muted/50"
                        )}
                    >
                        <div className="flex items-center gap-4">
                            <div
                                className={cn(
                                    "p-2.5 rounded-lg border transition-colors",
                                    settings.include_plain_text_in_duplicate_scan
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-muted text-muted-foreground border-border"
                                )}
                            >
                                <FileText className="w-4 h-4" />
                            </div>
                            <div className="space-y-0.5 text-left">
                                <span className="text-[13px] font-semibold">Include plain text &amp; source files</span>
                                <p className="text-[11px] text-muted-foreground">Scan .txt, .md, .json, code, etc. for duplicates</p>
                            </div>
                        </div>
                    </button>
                </section>
            )}

            {/* Ignored Items */}
            <section className="space-y-6">
                <div>
                    <h3 className="text-sm font-semibold mb-1 flex items-center gap-2 text-primary">
                        <Lock className="w-4 h-4" /> Global Exclusions
                    </h3>
                    <p className="text-[11px] text-muted-foreground italic">Force-skip specific criteria app-wide.</p>
                </div>
                
                <div className="space-y-4">
                    <BlockedList
                        title="Blocked Extensions"
                        description="Extensions to ignore even if type is enabled"
                        items={settings.blocked_extensions}
                        newItem={newExt}
                        setNewItem={setNewExt}
                        onAdd={() => {
                            if (newExt) {
                                addBlockedExtension(section, newExt);
                                setNewExt("");
                            }
                        }}
                        onRemove={(ext) => removeBlockedExtension(section, ext)}
                        placeholder="e.g. log, tmp"
                    />
                    <BlockedList
                        title="Blocked Names"
                        description={
                            section === "dedupe"
                                ? "Exact basename only (not full paths inside folders)"
                                : "Exact file/folder names to never process"
                        }
                        items={settings.blocked_names}
                        newItem={newName}
                        setNewItem={setNewName}
                        onAdd={() => {
                            if (newName) {
                                addBlockedName(section, newName);
                                setNewName("");
                            }
                        }}
                        onRemove={(name) => removeBlockedName(section, name)}
                        placeholder="e.g. node_modules, .git"
                    />
                </div>
            </section>
        </div>
    );
}

function PreviewToggle({ label, icon, active, onClick }: { label: string, icon: any, active: boolean, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px] font-medium transition-all duration-200",
                active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20 scale-105"
                    : "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted/60 hover:text-foreground hover:border-border"
            )}
        >
            {icon}
            {label}
        </button>
    );
}

function BlockedList({ title, description, items, newItem, setNewItem, onAdd, onRemove, placeholder }: {
    title: string,
    description: string,
    items: string[],
    newItem: string,
    setNewItem: (v: string) => void,
    onAdd: () => void,
    onRemove: (item: string) => void,
    placeholder: string
}) {
    return (
        <div className="p-4 rounded-xl bg-muted/20 border border-border/40">
            <div className="flex items-center justify-between mb-3">
                <div className="space-y-0.5">
                    <span className="text-[13px] font-medium">{title}</span>
                    <p className="text-[10px] text-muted-foreground">{description}</p>
                </div>
                <div className="flex gap-1.5 focus-within:ring-2 focus-within:ring-primary/20 rounded-lg transition-all">
                    <Input
                        value={newItem}
                        onChange={(e) => setNewItem(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && onAdd()}
                        placeholder={placeholder}
                        className="h-8 w-32 border-border/50 bg-background/50 text-[11px]"
                    />
                    <button
                        onClick={onAdd}
                        className="h-8 w-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
            </div>
            <div className="flex flex-wrap gap-1.5 min-h-[1.5rem]">
                {items.length === 0 && (
                    <p className="text-[10px] text-muted-foreground/50 italic py-1">No items blocked</p>
                )}
                {items.map((item) => (
                    <div
                        key={item}
                        className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md bg-muted/50 border border-border/50 text-[10px] group animate-in slide-in-from-right-2 duration-200"
                    >
                        <span className="font-medium">{item}</span>
                        <button
                            onClick={() => onRemove(item)}
                            className="p-0.5 rounded-sm hover:bg-destructive hover:text-destructive-foreground opacity-50 group-hover:opacity-100 transition-all"
                        >
                            <X className="w-2.5 h-2.5" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
