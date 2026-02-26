import { Music, FileQuestion, Loader2, FileText, Folder } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { isVideoExtension, isImageExtension, isAudioExtension, isTextExtension, isDocumentExtension } from "@/lib/fileTypes";
import { useSettingsStore } from "@/stores/settingsStore";
import { usePreviewStore } from "@/stores/previewStore";

interface FilePreviewContentProps {
    path: string;
    extension: string;
    name: string;
    is_dir?: boolean;
    className?: string;
    section: "explorer" | "dedupe" | "content_search";
}

function VideoPreview({ src, className }: { src: string; className?: string }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const volume = usePreviewStore((state) => state.volume);
    const isMuted = usePreviewStore((state) => state.isMuted);
    const setVolume = usePreviewStore((state) => state.setVolume);
    const setIsMuted = usePreviewStore((state) => state.setIsMuted);
    const rotation = usePreviewStore((state) => state.rotation);

    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        el.muted = isMuted;
        el.volume = volume;
    }, [src, isMuted, volume]);

    const handleVolumeChange = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
        const el = e.currentTarget;
        setVolume(el.volume);
        setIsMuted(el.muted);
    };

    return (
        <video
            ref={videoRef}
            controls
            src={src}
            className={cn(className, "transition-transform duration-300")}
            style={{ transform: `rotate(${rotation}deg)` }}
            onVolumeChange={handleVolumeChange}
            playsInline
        />
    );
}

export const FilePreviewContent = ({ path, extension, name, is_dir, className, section }: FilePreviewContentProps) => {
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

    const settings = useSettingsStore((state) => state.settings[section]);
    const previewSettings = settings.preview_enabled;

    const rotation = usePreviewStore((state) => state.rotation);
    const volume = usePreviewStore((state) => state.volume);
    const isMuted = usePreviewStore((state) => state.isMuted);
    const setVolume = usePreviewStore((state) => state.setVolume);
    const setIsMuted = usePreviewStore((state) => state.setIsMuted);

    const ext = extension.toLowerCase().replace(/^\./, '');
    const isImage = isImageExtension(ext) && previewSettings.image;
    const isVideo = isVideoExtension(ext) && previewSettings.video;
    const isAudio = isAudioExtension(ext) && previewSettings.audio;
    const isText = isTextExtension(ext) && previewSettings.text;
    const isDocument = isDocumentExtension(ext) && previewSettings.document;

    const isPreviewEnabled = isImage || isVideo || isAudio || isText || isDocument || is_dir;

    useEffect(() => {
        if (!path) {
            setContent(null);
            setPreviewError(null);
            return;
        }

        if (!isPreviewEnabled) {
            setLoading(false);
            setContent(null);
            return;
        }

        setLoading(true);
        setPreviewError(null);

        if (isText) {
            invoke<string>("get_file_text_content", { path })
                .then((c) => { setContent(c); setPreviewError(null); })
                .catch((err: any) => {
                    const msg = typeof err === "string" ? err : err?.message ?? "Failed to load file";
                    setPreviewError(msg);
                    setContent(null);
                })
                .finally(() => setLoading(false));
        } else if (isDocument && ext === "pdf") {
            invoke<string>("get_file_base64_content", { path })
                .then((c) => { setContent(c); setPreviewError(null); })
                .catch((err: any) => {
                    const msg = typeof err === "string" ? err : err?.message ?? "Failed to load file";
                    setPreviewError(msg);
                    setContent(null);
                })
                .finally(() => setLoading(false));
        } else if (isImage || isVideo || isAudio) {
            setContent(`vmedia://localhost/${encodeURIComponent(path)}`);
            setLoading(false);
        } else {
            setLoading(false);
        }
    }, [path, isText, isDocument, isImage, isVideo, isAudio, isPreviewEnabled, ext]);

    if (!isPreviewEnabled && !is_dir) {
        return (
            <div className={cn("flex flex-col items-center justify-center gap-4 text-muted-foreground bg-muted/20 p-8 rounded-xl border border-dashed", className)}>
                <FileQuestion className="w-16 h-16 opacity-50" />
                <div className="text-center">
                    <p className="text-sm font-medium">Preview disabled for this type in {section} settings.</p>
                    <p className="text-xs opacity-70 mt-1 truncate max-w-[250px]">{name}</p>
                </div>
            </div>
        );
    }

    return (
        <div className={cn("relative flex items-center justify-center w-full h-full", className)}>
            {previewError && (
                <div className="flex flex-col items-center justify-center gap-4 p-8 text-center max-w-md">
                    <FileQuestion className="w-12 h-12 text-amber-500" />
                    <p className="text-sm font-medium text-muted-foreground">{previewError}</p>
                </div>
            )}
            {is_dir && (
                <div className="flex flex-col items-center justify-center gap-6 p-12 text-center animate-in fade-in duration-500">
                    <div className="w-32 h-32 rounded-3xl bg-blue-500/10 flex items-center justify-center border-4 border-blue-500/20 shadow-inner group/folder">
                        <Folder className="w-16 h-16 text-blue-500 fill-blue-500/20 group-hover/folder:scale-110 transition-transform duration-300" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-black tracking-tighter text-foreground">{name}</h2>
                        <div className="flex items-center justify-center gap-2">
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-[10px] font-bold uppercase tracking-widest border border-blue-500/20">Directory</span>
                            <span className="text-[10px] text-muted-foreground font-mono opacity-60">{path}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 w-full max-w-sm mt-4">
                        <div className="p-3 rounded-xl bg-muted/20 border border-muted/30 flex flex-col gap-1 items-center">
                            <span className="text-[10px] text-muted-foreground uppercase font-black">Type</span>
                            <span className="text-xs font-bold text-foreground">Folder</span>
                        </div>
                        <div className="p-3 rounded-xl bg-muted/20 border border-muted/30 flex flex-col gap-1 items-center">
                            <span className="text-[10px] text-muted-foreground uppercase font-black">Status</span>
                            <span className="text-xs font-bold text-foreground">Scanned</span>
                        </div>
                    </div>
                </div>
            )}
            {loading && !previewError && !is_dir && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm transition-all duration-300">
                    <div className="flex items-center gap-3 text-primary animate-pulse font-medium bg-background/80 px-4 py-2 rounded-full shadow-lg border">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-xs">Streaming...</span>
                    </div>
                </div>
            )}
            {isImage && content && !previewError && (
                <img
                    src={content}
                    alt={name}
                    className="max-w-full max-h-full object-contain shadow-2xl rounded-sm transition-transform duration-300"
                    style={{ transform: `rotate(${rotation}deg)` }}
                    loading="lazy"
                />
            )}

            {isVideo && content && !previewError && (
                <VideoPreview src={content} className="w-full h-auto aspect-video object-contain shadow-2xl rounded-sm" />
            )}

            {isAudio && !previewError && (
                <div className="flex flex-col items-center gap-6">
                    <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                        <Music className="w-12 h-12 text-primary/50" />
                    </div>
                    <audio
                        controls
                        src={content || undefined}
                        className="w-64 shadow-lg"
                        ref={(el) => {
                            if (el) {
                                el.volume = volume;
                                el.muted = isMuted;
                            }
                        }}
                        onVolumeChange={(e) => {
                            setVolume(e.currentTarget.volume);
                            setIsMuted(e.currentTarget.muted);
                        }}
                    />
                </div>
            )}

            {isText && content && !previewError && (
                <div className="w-full h-full p-4 font-mono text-[10px] bg-muted/20 border rounded-lg whitespace-pre overflow-auto select-text">
                    {content}
                </div>
            )}

            {isDocument && ext === "pdf" && content && !previewError && (
                <embed
                    src={content}
                    type="application/pdf"
                    className="w-full h-full rounded-sm shadow-xl transition-transform duration-300"
                    style={{ transform: `rotate(${rotation}deg)` }}
                />
            )}

            {isDocument && ext !== "pdf" && (
                <div className="flex flex-col items-center justify-center gap-4 text-muted-foreground bg-muted/10 p-12 rounded-2xl border border-dashed text-center">
                    <FileText className="w-16 h-16 opacity-30" />
                    <div className="space-y-1">
                        <p className="text-sm font-bold">Document Preview Placeholder</p>
                        <p className="text-[10px] opacity-60 max-w-[200px]">
                            Full preview for {extension.toUpperCase()} is not yet available, but it is correctly categorized.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
