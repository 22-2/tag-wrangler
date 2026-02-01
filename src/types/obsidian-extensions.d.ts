import "obsidian";

declare global {
    const app: import("obsidian").App;
    const activeWindow: Window & { createEl: (tag: string, attrs?: any, cb?: (el: HTMLElement) => void) => HTMLElement };

    interface Element {
        find?(selectors: string): Element | null;
        matchParent?(selector: string, container?: EventTarget | null): Element | null;
        setCollapsed?(collapsed: boolean): void;
        vChildren?: { children: Element[] };
    }

    interface HTMLElement {
        find?(selectors: string): HTMLElement | null;
        matchParent?(selector: string, container?: EventTarget | null): HTMLElement | null;
        setCollapsed?(collapsed: boolean): void;
        vChildren?: { children: HTMLElement[] };
    }

    interface Event {
        obsidian_contextmenu?: import("obsidian").Menu;
    }

    interface DragEvent {
        obsidian_contextmenu?: import("obsidian").Menu;
    }
}

export {};
