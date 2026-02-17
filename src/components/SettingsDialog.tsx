import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/stores/settingsStore";
import { Eye, EyeOff, Shield, Image, Video, Music, FileText, FileSearch, Trash2, Plus, LayoutGrid } from "lucide-react";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
    const settings = useSettingsStore((state) => state.settings);
    const grid_thumbnail_width = useSettingsStore((state) => state.grid_thumbnail_width);
    const grid_thumbnail_height = useSettingsStore((state) => state.grid_thumbnail_height);
    const updateSettings = useSettingsStore((state) => state.updateSettings);
    const updatePreviewSettings = useSettingsStore((state) => state.updatePreviewSettings);
    const updateGridThumbnailSize = useSettingsStore((state) => state.updateGridThumbnailSize);
    const addBlockedExtension = useSettingsStore((state) => state.addBlockedExtension);
    const removeBlockedExtension = useSettingsStore((state) => state.removeBlockedExtension);
    const [newExt, setNewExt] = useState("");
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

    const handleAddExt = () => {
        if (newExt) {
            addBlockedExtension(newExt);
            setNewExt("");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Explorer Settings</DialogTitle>
                    <DialogDescription>
                        Configure file visibility and preview behavior.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Visibility Section */}
                    <section className="space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <Eye className="w-3 h-3" /> Visibility
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                variant={settings.show_hidden_files ? "default" : "outline"}
                                className="justify-start gap-2 h-9"
                                onClick={() => updateSettings({ show_hidden_files: !settings.show_hidden_files })}
                            >
                                {settings.show_hidden_files ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 opacity-50" />}
                                Hidden Files
                            </Button>
                            <Button
                                variant={settings.show_system_files ? "default" : "outline"}
                                className="justify-start gap-2 h-9"
                                onClick={() => updateSettings({ show_system_files: !settings.show_system_files })}
                            >
                                <Shield className="w-4 h-4" />
                                System Files
                            </Button>
                        </div>
                    </section>

                    {/* Preview Section */}
                    <section className="space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <FileSearch className="w-3 h-3" /> Preview Behavior
                        </h3>
                        <div className="grid grid-cols-3 gap-2">
                            <PreviewToggle
                                label="Images"
                                icon={<Image className="w-4 h-4" />}
                                active={settings.preview_enabled.image}
                                onClick={() => updatePreviewSettings({ image: !settings.preview_enabled.image })}
                            />
                            <PreviewToggle
                                label="Video"
                                icon={<Video className="w-4 h-4" />}
                                active={settings.preview_enabled.video}
                                onClick={() => updatePreviewSettings({ video: !settings.preview_enabled.video })}
                            />
                            <PreviewToggle
                                label="Audio"
                                icon={<Music className="w-4 h-4" />}
                                active={settings.preview_enabled.audio}
                                onClick={() => updatePreviewSettings({ audio: !settings.preview_enabled.audio })}
                            />
                            <PreviewToggle
                                label="Text"
                                icon={<FileText className="w-4 h-4" />}
                                active={settings.preview_enabled.text}
                                onClick={() => updatePreviewSettings({ text: !settings.preview_enabled.text })}
                            />
                            <PreviewToggle
                                label="PDF"
                                icon={<FileSearch className="w-4 h-4" />}
                                active={settings.preview_enabled.pdf}
                                onClick={() => updatePreviewSettings({ pdf: !settings.preview_enabled.pdf })}
                            />
                        </div>
                    </section>

                    {/* Grid view thumbnail size */}
                    <section className="space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <LayoutGrid className="w-3 h-3" /> Grid view thumbnail size
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            Width and height (px) of the content preview in grid view. Stored in localStorage.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-medium text-muted-foreground block mb-1">Width (px)</label>
                                <Input
                                    type="number"
                                    min={20}
                                    max={400}
                                    value={widthInput}
                                    onChange={(e) => setWidthInput(e.target.value)}
                                    onBlur={commitWidth}
                                    onKeyDown={(e) => e.key === "Enter" && commitWidth()}
                                    className="h-8 text-xs"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-medium text-muted-foreground block mb-1">Height (px)</label>
                                <Input
                                    type="number"
                                    min={20}
                                    max={400}
                                    value={heightInput}
                                    onChange={(e) => setHeightInput(e.target.value)}
                                    onBlur={commitHeight}
                                    onKeyDown={(e) => e.key === "Enter" && commitHeight()}
                                    className="h-8 text-xs"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Blocked Extensions */}
                    <section className="space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <Trash2 className="w-3 h-3" /> Performance Filters
                        </h3>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Ex: .tmp, .iso"
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
                            {settings.blocked_extensions.map(ext => (
                                <div key={ext} className="flex items-center gap-1.5 px-2 py-0.5 bg-muted rounded-full text-[10px] border">
                                    <span>.{ext}</span>
                                    <button onClick={() => removeBlockedExtension(ext)} className="hover:text-destructive">
                                        <Plus className="w-3 h-3 rotate-45" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    );
};

const PreviewToggle = ({ label, icon, active, onClick }: { label: string, icon: React.ReactNode, active: boolean, onClick: () => void }) => (
    <Button
        variant={active ? "default" : "outline"}
        className="flex flex-col h-16 gap-1 p-2"
        onClick={onClick}
    >
        {icon}
        <span className="text-[10px] font-medium">{label}</span>
    </Button>
);
