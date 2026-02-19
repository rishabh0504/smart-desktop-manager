"use client"

import { useEffect } from "react"
import { useSettingsStore } from "@/stores/settingsStore"

// Helper to convert hex to HSL string for Tailwind/shadcn
const hexToHsl = (hex: string) => {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
        r = parseInt(hex.slice(1, 3), 16);
        g = parseInt(hex.slice(3, 5), 16);
        b = parseInt(hex.slice(5, 7), 16);
    }
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return `${(h * 360).toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%`;
}

export const ThemeApplier = () => {
    const theme = useSettingsStore((state) => state.settings.theme)

    useEffect(() => {
        const root = document.documentElement;
        const styleId = "custom-theme-styles";
        let styleEl = document.getElementById(styleId);

        if (theme.use_custom_color && theme.custom_color) {
            const isGradient = theme.custom_color.includes("gradient");

            if (!styleEl) {
                styleEl = document.createElement("style");
                styleEl.id = styleId;
                document.head.appendChild(styleEl);
            }

            if (isGradient) {
                // For gradients, we use a fallback primary for text/borders and override background
                root.style.setProperty("--primary", "210 40% 98%"); // Off-white for readability in dark mode
                styleEl.innerHTML = `
                    .bg-primary {
                        background: ${theme.custom_color} !important;
                        background-image: ${theme.custom_color} !important;
                        color: white !important;
                    }
                    .text-primary {
                        background: ${theme.custom_color};
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        display: inline-block;
                    }
                    .border-primary {
                        border-image: ${theme.custom_color} 1 !important;
                    }
                `;
            } else {
                // For solid colors, we use the standard HSL variable system
                const hsl = hexToHsl(theme.custom_color);
                root.style.setProperty("--primary", hsl);

                // Also set a variable to determine if text should be black or white on primary
                // By default shadcn-dark uses 222.2 47.4% 11.2% (dark) for primary-foreground
                // but we might want white for most custom colors.
                root.style.setProperty("--primary-foreground", "210 40% 98%");

                styleEl.innerHTML = ""; // No extra CSS needed for solid primary
            }
        } else {
            // Restore default blue/system colors
            if (styleEl) styleEl.remove();
            root.style.removeProperty("--primary");
            root.style.removeProperty("--primary-foreground");
        }
    }, [theme]);

    return null;
}
