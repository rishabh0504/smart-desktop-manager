import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/stores/settingsStore";
import { Eye, EyeOff, Shield, Image, Video, Music, FileText, FileSearch, Trash2, Plus, LayoutGrid, Settings2, ScanSearch, Archive, Palette, Check, Monitor, Search, Eraser } from "lucide-react";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";


interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type SettingsSection = "explorer" | "dedupe" | "content_search" | "clean" | "appearance";

export const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
    const [activeSection, setActiveSection] = useState<SettingsSection>("explorer");
    const grid_thumbnail_width = useSettingsStore((state) => state.grid_thumbnail_width);
    const grid_thumbnail_height = useSettingsStore((state) => state.grid_thumbnail_height);
    const updateGridThumbnailSize = useSettingsStore((state) => state.updateGridThumbnailSize);

    const [widthInput, setWidthInput] = useState<string>("");
    const [heightInput, setHeightInput] = useState<string>("");

    const syncGridInputsFromStore = () => {
        setWidthInput(String(grid_thumbnail_width));
        setHeightInput(String(grid_thumbnail_height));
    };

    useEffect(() => {
        if (open) syncGridInputsFromStore();
    }, [open, grid_thumbnail_width, grid_thumbnail_height]);

    const commitWidth = () => {
        const n = Number(widthInput);
        const parsed = Number.isFinite(n) ? Math.min(400, Math.max(20, Math.round(n))) : 30;
        updateGridThumbnailSize(parsed, grid_thumbnail_height);
        setWidthInput(String(parsed));
    };

    const commitHeight = () => {
        const n = Number(heightInput);
        const parsed = Number.isFinite(n) ? Math.min(400, Math.max(20, Math.round(n))) : 30;
        updateGridThumbnailSize(grid_thumbnail_width, parsed);
        setHeightInput(String(parsed));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl p-0 h-[500px] flex flex-row overflow-hidden">
                {/* Sidebar */}
                <div className="w-56 bg-muted/30 border-r flex flex-col p-2 gap-1">
                    <div className="px-3 py-4">
                        <h2 className="text-sm font-bold tracking-tight">Settings</h2>
                    </div>
                    <SidebarItem
                        label="Explorer"
                        icon={<Settings2 className="w-4 h-4" />}
                        active={activeSection === "explorer"}
                        onClick={() => setActiveSection("explorer")}
                    />
                    <SidebarItem
                        label="Deduplication"
                        icon={<ScanSearch className="w-4 h-4" />}
                        active={activeSection === "dedupe"}
                        onClick={() => setActiveSection("dedupe")}
                    />
                    <SidebarItem
                        label="Content Search"
                        icon={<Search className="w-4 h-4" />}
                        active={activeSection === "content_search"}
                        onClick={() => setActiveSection("content_search")}
                    />
                    <SidebarItem
                        label="Clean View"
                        icon={<Eraser className="w-4 h-4" />}
                        active={activeSection === "clean"}
                        onClick={() => setActiveSection("clean")}
                    />
                    <div className="flex-1" />
                    <Separator className="my-1 opacity-50" />
                    <SidebarItem
                        label="Appearance"
                        icon={<Palette className="w-4 h-4" />}
                        active={activeSection === "appearance"}
                        onClick={() => setActiveSection("appearance")}
                    />
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-col min-w-0">
                    <DialogHeader className="px-6 pt-6 pb-2">
                        <DialogTitle>
                            {activeSection === "explorer" ? "Explorer Settings" :
                                activeSection === "dedupe" ? "Deduplication Settings" :
                                    activeSection === "content_search" ? "Content Search Settings" :
                                        activeSection === "clean" ? "Clean View Settings" :
                                            "Appearance Settings"}
                        </DialogTitle>
                        <DialogDescription>
                            {activeSection === "explorer"
                                ? "Configure how you browse and preview files."
                                : activeSection === "dedupe"
                                    ? "Adjust filters and behavior for duplicate detection."
                                    : activeSection === "content_search"
                                        ? "Adjust categories and filters for content search."
                                        : "Customize the look and feel of your workspace."
                            }
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-8">
                        {activeSection === "explorer" || activeSection === "dedupe" || activeSection === "content_search" ? (
                            <ConfigSectionView section={activeSection} />
                        ) : activeSection === "appearance" ? (
                            <AppearanceSectionView />
                        ) : (
                            <CleanViewPlaceholder />
                        )}

                        {activeSection === "explorer" && (
                            <section className="space-y-3">
                                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                    <LayoutGrid className="w-3 h-3" /> Grid view thumbnail size
                                </h3>
                                <p className="text-[10px] text-muted-foreground">
                                    Width and height (px) of the content preview in grid view.
                                </p>
                                <div className="grid grid-cols-2 gap-3 max-w-[240px]">
                                    <div>
                                        <label className="text-[9px] font-medium text-muted-foreground block mb-1">Width (px)</label>
                                        <Input
                                            type="number"
                                            value={widthInput}
                                            onChange={(e) => setWidthInput(e.target.value)}
                                            onBlur={commitWidth}
                                            onKeyDown={(e) => e.key === "Enter" && commitWidth()}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-medium text-muted-foreground block mb-1">Height (px)</label>
                                        <Input
                                            type="number"
                                            value={heightInput}
                                            onChange={(e) => setHeightInput(e.target.value)}
                                            onBlur={commitHeight}
                                            onKeyDown={(e) => e.key === "Enter" && commitHeight()}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

const SidebarItem = ({ label, icon, active, onClick }: { label: string, icon: React.ReactNode, active: boolean, onClick: () => void }) => (
    <button
        onClick={onClick}
        className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors",
            active ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted text-muted-foreground hover:text-foreground"
        )}
    >
        {icon}
        {label}
    </button>
);

const ConfigSectionView = ({ section }: { section: "explorer" | "dedupe" | "content_search" }) => {
    const settings = useSettingsStore((state) => state.settings[section]);
    const updateSettings = useSettingsStore((state) => state.updateSettings);
    const updatePreviewSettings = useSettingsStore((state) => state.updatePreviewSettings);
    const addBlockedExtension = useSettingsStore((state) => state.addBlockedExtension);
    const removeBlockedExtension = useSettingsStore((state) => state.removeBlockedExtension);
    const [newExt, setNewExt] = useState("");

    const handleAddExt = () => {
        if (newExt) {
            addBlockedExtension(section, newExt);
            setNewExt("");
        }
    };

    return (
        <>
            {/* Visibility Section */}
            <section className="space-y-3">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <Eye className="w-3 h-3" /> Visibility
                </h3>
                <div className="flex gap-2">
                    <Button
                        variant={settings.show_hidden_files ? "default" : "outline"}
                        className="h-9 px-3 gap-2 text-xs"
                        onClick={() => updateSettings(section, { show_hidden_files: !settings.show_hidden_files })}
                    >
                        {settings.show_hidden_files ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 opacity-50" />}
                        Hidden Files
                    </Button>
                    <Button
                        variant={settings.show_system_files ? "default" : "outline"}
                        className="h-9 px-3 gap-2 text-xs"
                        onClick={() => updateSettings(section, { show_system_files: !settings.show_system_files })}
                    >
                        <Shield className="w-4 h-4" />
                        System Files
                    </Button>
                </div>
            </section>

            {/* Preview Section */}
            <section className="space-y-3">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <FileSearch className="w-3 h-3" /> Preview & Filtering
                </h3>
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
                        label="Text"
                        icon={<FileText className="w-4 h-4" />}
                        active={settings.preview_enabled.text}
                        onClick={() => updatePreviewSettings(section, { text: !settings.preview_enabled.text })}
                    />
                    <PreviewToggle
                        label="Documents"
                        icon={<FileText className="w-4 h-4" />}
                        active={settings.preview_enabled.document}
                        onClick={() => updatePreviewSettings(section, { document: !settings.preview_enabled.document })}
                    />
                    <PreviewToggle
                        label="Archives"
                        icon={<Archive className="w-4 h-4" />}
                        active={settings.preview_enabled.archive}
                        onClick={() => updatePreviewSettings(section, { archive: !settings.preview_enabled.archive })}
                    />
                </div>
            </section>

            {/* Performance Filters */}
            {section !== "content_search" && (
                <section className="space-y-3">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <Trash2 className="w-3 h-3" /> Performance Filters
                    </h3>
                    <div className="flex gap-2 max-w-[300px]">
                        <Input
                            placeholder="Ex: iso, tmp, log"
                            value={newExt}
                            onChange={(e) => setNewExt(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddExt()}
                            className="h-8 text-xs"
                        />
                        <Button size="sm" className="h-8 px-2" onClick={handleAddExt}>
                            <Plus className="w-4 h-4" />
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {settings.blocked_extensions.map((ext: string) => (
                            <div key={ext} className="flex items-center gap-1.5 px-2 py-0.5 bg-muted rounded-full text-[10px] border shadow-sm">
                                <span>.{ext}</span>
                                <button onClick={() => removeBlockedExtension(section, ext)} className="hover:text-destructive transition-colors">
                                    <Plus className="w-3 h-3 rotate-45" />
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </>
    );
};

const PreviewToggle = ({ label, icon, active, onClick }: { label: string, icon: React.ReactNode, active: boolean, onClick: () => void }) => (
    <Button
        variant={active ? "default" : "outline"}
        className="flex flex-col h-14 w-20 gap-1 p-2 shadow-sm transition-all"
        onClick={onClick}
    >
        {icon}
        <span className="text-[9px] font-medium">{label}</span>
    </Button>
);

const AppearanceSectionView = () => {
    const theme = useSettingsStore((state) => state.settings.theme);
    const updateTheme = useSettingsStore((state) => state.updateTheme);

    const presets = [
        { name: "Blue (Default)", color: "#3b82f6" },
        { name: "Purple", color: "#a855f7" },
        { name: "Rose", color: "#f43f5e" },
        { name: "Amber", color: "#f59e0b" },
        { name: "Emerald", color: "#10b981" },
        { name: "Indigo", color: "#6366f1" },
        { name: "Cyan", color: "#06b6d4" },
        { name: "Slate", color: "#64748b" },
    ];

    const gradients = [
        { name: "Ocean", color: "linear-gradient(to right, #0ea5e9, #2563eb)" },
        { name: "Sunset", color: "linear-gradient(to right, #f43f5e, #fb923c)" },
        { name: "Cosmic", color: "linear-gradient(to right, #7c3aed, #db2777)" },
        { name: "Forest", color: "linear-gradient(to right, #059669, #10b981)" },
    ];

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Theme Selection Type */}
            <div className="grid grid-cols-2 gap-4">
                <button
                    onClick={() => updateTheme({ use_custom_color: false })}
                    className={cn(
                        "flex flex-col items-start p-4 rounded-xl border-2 transition-all text-left relative overflow-hidden group",
                        !theme.use_custom_color ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-primary/30"
                    )}
                >
                    <div className="flex items-center justify-between w-full mb-3">
                        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                            <Monitor className="w-5 h-5" />
                        </div>
                        {!theme.use_custom_color && (
                            <div className="bg-primary text-primary-foreground rounded-full p-1">
                                <Check className="w-3 h-3" />
                            </div>
                        )}
                    </div>
                    <span className="text-sm font-bold block">Current Theme</span>
                    <span className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                        Default system aesthetic. Clean, professional blue accents.
                    </span>
                    {!theme.use_custom_color && (
                        <div className="absolute bottom-0 right-0 w-12 h-12 bg-primary/10 rounded-tl-full -mr-4 -mb-4 transition-transform group-hover:scale-110" />
                    )}
                </button>

                <button
                    onClick={() => updateTheme({ use_custom_color: true })}
                    className={cn(
                        "flex flex-col items-start p-4 rounded-xl border-2 transition-all text-left relative overflow-hidden group",
                        theme.use_custom_color ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-primary/30"
                    )}
                >
                    <div className="flex items-center justify-between w-full mb-3">
                        <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                            <Palette className="w-5 h-5" />
                        </div>
                        {theme.use_custom_color && (
                            <div className="bg-primary text-primary-foreground rounded-full p-1">
                                <Check className="w-3 h-3" />
                            </div>
                        )}
                    </div>
                    <span className="text-sm font-bold block">Custom Theme</span>
                    <span className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                        Personalize with colors or dynamic gradients.
                    </span>
                    {theme.use_custom_color && (
                        <div className="absolute bottom-0 right-0 w-12 h-12 bg-primary/10 rounded-tl-full -mr-4 -mb-4 transition-transform group-hover:scale-110" />
                    )}
                </button>
            </div>

            {theme.use_custom_color && (
                <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
                    <Separator />

                    <section className="space-y-3">
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <Palette className="w-3 h-3" /> Solid Color Presets
                        </h3>
                        <div className="grid grid-cols-4 gap-3">
                            {presets.map((p) => (
                                <button
                                    key={p.color}
                                    onClick={() => updateTheme({ custom_color: p.color })}
                                    className={cn(
                                        "h-12 rounded-xl border-2 transition-all flex items-center justify-center group relative overflow-hidden shadow-sm",
                                        theme.custom_color === p.color ? "border-primary scale-105" : "border-transparent hover:border-primary/30"
                                    )}
                                    style={{ backgroundColor: p.color }}
                                >
                                    {theme.custom_color === p.color && (
                                        <div className="bg-white/20 backdrop-blur-md rounded-full p-1 border border-white/30 shadow-lg">
                                            <Check className="w-4 h-4 text-white drop-shadow-sm" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/0 hover:bg-black/5 transition-colors" />
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="space-y-3">
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <LayoutGrid className="w-3 h-3" /> Gradient Presets
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            {gradients.map((g) => (
                                <button
                                    key={g.color}
                                    onClick={() => updateTheme({ custom_color: g.color })}
                                    className={cn(
                                        "h-14 rounded-xl border-2 transition-all flex items-center justify-between px-4 group shadow-sm",
                                        theme.custom_color === g.color ? "border-primary scale-[1.02]" : "border-transparent hover:border-primary/30"
                                    )}
                                    style={{ background: g.color }}
                                >
                                    <span className="text-xs font-bold text-white drop-shadow-md">{g.name}</span>
                                    {theme.custom_color === g.color && (
                                        <div className="bg-white/20 backdrop-blur-md rounded-full p-1 border border-white/30 shadow-lg">
                                            <Check className="w-4 h-4 text-white drop-shadow-sm" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="space-y-3">
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <Settings2 className="w-3 h-3" /> Custom Hex or CSS Value
                        </h3>
                        <div className="flex gap-3">
                            <div className="relative flex-1">
                                <Input
                                    value={theme.custom_color}
                                    onChange={(e) => updateTheme({ custom_color: e.target.value })}
                                    className="h-10 text-xs pl-12 font-mono rounded-xl bg-muted/50 border-none shadow-inner"
                                    placeholder="#hex or linear-gradient(...)"
                                />
                                <div
                                    className="absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg shadow-md border border-white/20"
                                    style={{ background: theme.custom_color }}
                                />
                            </div>
                            <Button
                                variant="outline"
                                className="h-10 px-4 rounded-xl hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all"
                                onClick={() => updateTheme({ custom_color: "#3b82f6" })}
                            >
                                Reset to Blue
                            </Button>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
};

const CleanViewPlaceholder = () => (
    <div className="flex flex-col items-center justify-center h-full py-12 text-center opacity-40">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <Eraser className="w-8 h-8" />
        </div>
        <h3 className="text-sm font-bold">No Config Required</h3>
        <p className="text-[10px] text-muted-foreground max-w-[200px] mt-1">
            Clean View currently focuses on identifying empty folders and doesn't require specific filtering settings.
        </p>
    </div>
);
