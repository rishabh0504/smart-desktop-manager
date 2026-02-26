# Welcome Page View (`src/components/WelcomePage.tsx`)

The `WelcomePage` serves as the initial zero-state "splash screen" landing page when the user launches the Smart File Explorer without any active directories opened.

## Component Overview
The interface is a highly aesthetic, non-interactive (mostly) background canvas designed to quickly route the user into an active Explorer session. It utilizes modern design elements like radial gradient masking and background grids for depth.

## Aesthetics and Animations
- **`framer-motion` Integration**: Upon mount, the entire central container slides up (`y: 20 -> 0`) while fading in (`opacity: 0 -> 1`) across `0.5s`, giving the app a premium, native feel instantly upon launch.
- **Glassmorphism**: The central Folder icon is wrapped in a `backdrop-blur-xl` container with subtle primary-colored drop shadows (`shadow-primary/20`) to create a glowing glass effect.
- **Background Grids**: Employs a fixed CSS grid overlay (`bg-grid-white/[0.02]`) masked by a smooth radial gradient (`[mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]`) so the grid smoothly fades to black near the edges of the window.

## State Management (`useExplorerStore`)
The component requires minimal data access, relying only on the `addTab` action from the globally available `useExplorerStore`.

### Quick Actions
The component provides two primary onboarding buttons:
1. **Open New Lane**: Fires `addTab("/Users/rajantiwari")`. This implicitly creates a new Explorer tab locked to the host OS User's base home directory.
2. **Open Current Project**: Fires `addTab("/Users/rajantiwari/Desktop/file-viewer")`. This targets the current active development directory to speed up regular developer workflows.

*Note: In future iterations, these static paths could be refactored to consume the `homeDir()` dynamically (via Tauri) to remain agnostic across different user hardware.*

## Footer
A static, non-interactive footer reminds users of high-value shortcut combinations (e.g., `⌘F Search`) to encourage power-user behavior immediately.
