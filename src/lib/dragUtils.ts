export const createDragGhost = (count: number, label: string) => {
    const ghost = document.createElement("div");
    ghost.style.position = "absolute";
    ghost.style.top = "-1000px";
    ghost.style.left = "-1000px";
    ghost.style.padding = "8px 16px";
    ghost.style.background = "hsl(var(--primary))";
    ghost.style.color = "hsl(var(--primary-foreground))";
    ghost.style.borderRadius = "8px";
    ghost.style.fontSize = "12px";
    ghost.style.fontWeight = "bold";
    ghost.style.boxShadow = "0 8px 16px rgba(0,0,0,0.3)";
    ghost.style.display = "flex";
    ghost.style.alignItems = "center";
    ghost.style.gap = "8px";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "9999";
    ghost.style.border = "1px solid rgba(255,255,255,0.2)";

    ghost.innerHTML = `
        <span style="background: white; color: black; border-radius: 99px; width: 18px; height: 18px; display: flex; items-center; justify-content: center; font-size: 10px;">
            ${count}
        </span>
        <span style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${label}
        </span>
    `;

    document.body.appendChild(ghost);

    // Clean up after the drag starts
    setTimeout(() => {
        if (ghost.parentNode) {
            document.body.removeChild(ghost);
        }
    }, 0);

    return ghost;
};
