import { Music, FileQuestion, Loader2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { isVideoExtension } from "@/lib/fileTypes";
import { useSettingsStore } from "@/stores/settingsStore";

interface FilePreviewContentProps {
    path: string;
    extension: string;
    name: string;
    className?: string;
    section: "explorer" | "dedupe" | "content_search";
}

function VideoPreview({ src, className }: { src: string; className?: string }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        el.muted = true;
        const onPlay = () => { el.muted = true; };
        el.addEventListener("play", onPlay);
        return () => el.removeEventListener("play", onPlay);
    }, [src]);
    return (
        <video
            ref={videoRef}
            controls
            src={src}
            className={className}
            autoPlay
            muted
            playsInline
        />
    );
}

export const FilePreviewContent = ({ path, extension, name, className, section }: FilePreviewContentProps) => {
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

    const settings = useSettingsStore((state) => state.settings[section]);
    const previewSettings = settings.preview_enabled;

    const ext = extension.toLowerCase();
    const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext) && previewSettings.image;
    const isVideo = isVideoExtension(ext) && previewSettings.video;
    const isAudio = ["mp3", "wav", "ogg", "flac"].includes(ext) && previewSettings.audio;
    const isText = ["txt", "md", "js", "ts", "json", "rs", "css", "html", "py", "sh", "yml", "yaml"].includes(ext) && previewSettings.text;
    const isPdf = ext === "pdf" && previewSettings.pdf;

    const isPreviewEnabled = isImage || isVideo || isAudio || isText || isPdf;

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
        } else if (isPdf) {
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
    }, [path, isText, isPdf, isImage, isVideo, isAudio, isPreviewEnabled]);

    if (!isPreviewEnabled) {
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
            {loading && !previewError && (
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
                    className="max-w-full max-h-full object-contain shadow-2xl rounded-sm"
                    loading="lazy"
                />
            )}

            {isVideo && content && !previewError && (
                <VideoPreview src={content} className="w-full h-full object-contain shadow-2xl rounded-sm" />
            )}

            {isAudio && !previewError && (
                <div className="flex flex-col items-center gap-6">
                    <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                        <Music className="w-12 h-12 text-primary/50" />
                    </div>
                    <audio controls src={content || undefined} className="w-64 shadow-lg" autoPlay muted />
                </div>
            )}

            {isText && content && !previewError && (
                <div className="w-full h-full p-4 font-mono text-[10px] bg-muted/20 border rounded-lg whitespace-pre overflow-auto select-text">
                    {content}
                </div>
            )}

            {isPdf && content && !previewError && (
                <embed
                    src={content}
                    type="application/pdf"
                    className="w-full h-full rounded-sm shadow-xl"
                />
            )}
        </div>
    );
};
