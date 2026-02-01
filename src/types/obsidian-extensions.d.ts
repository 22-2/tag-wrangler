import "obsidian";

declare global {
    const app: import("obsidian").App;
    const activeWindow: Window;

    interface Window {
        createEl(tag: string, attrs?: unknown, cb?: (el: HTMLElement) => void): HTMLElement;
    }

    interface Element {
        find?(selectors: string): Element | null;
        matchParent?(selector: string, container?: EventTarget | null): Element | null;
        setCollapsed?(collapsed: boolean): void;
        vChildren?: { children: Element[] };
        on(event: string, selector: string, callback: (event: Event, targetEl: HTMLElement) => void, options?: AddEventListenerOptions): void;
        off(event: string, selector: string, callback: (event: Event, targetEl: HTMLElement) => void, options?: AddEventListenerOptions): void;
    }

    interface HTMLElement {
        find?(selectors: string): HTMLElement | null;
        matchParent?(selector: string, container?: EventTarget | null): HTMLElement | null;
        setCollapsed?(collapsed: boolean): void;
        vChildren?: { children: HTMLElement[] };
        on(event: string, selector: string, callback: (event: Event, targetEl: HTMLElement) => void, options?: AddEventListenerOptions): void;
        off(event: string, selector: string, callback: (event: Event, targetEl: HTMLElement) => void, options?: AddEventListenerOptions): void;
    }

    interface Event {
        obsidian_contextmenu?: import("obsidian").Menu;
    }

    interface DragEvent {
        obsidian_contextmenu?: import("obsidian").Menu;
    }
}

declare module "obsidian" {
    interface MetadataCache {
        getTags?(): Record<string, number>;
        getCachedFiles?(): string[];
        getCache(path: string): CachedMetadata | null;
        on(name: "delete", callback: (file: TFile) => void, ctx?: unknown): EventRef;
    }

    interface Vault {
        getAvailablePath(basePath: string, extension: string): string;
    }

    interface TFolder {
        getParentPrefix(): string;
    }

    interface Editor {
        getClickableTokenAt(pos: EditorPosition): { type: string; text: string; start: EditorPosition; end: EditorPosition } | null;
    }

    interface Workspace {
        registerHoverLinkSource(source: string, info: { display: string; defaultMod: boolean }): void;
        iterateAllLeaves(callback: (leaf: import("obsidian").WorkspaceLeaf) => unknown): void;
    }

    interface View {
        requestUpdateTags?(): void;
        tagDoms?: Record<string, { children: HTMLElement[], vChildren?: { children: HTMLElement[] } }>;
        root?: { children: HTMLElement[], vChildren?: { children: HTMLElement[] } };
    }

    interface App {
        dragManager: {
            onDragStart(event: DragEvent, info: { source: string; type: string; title: string; icon: string }): void;
            draggable: { source: string; type: string; title: string; icon: string; filename?: string } | null;
            updateHover(el: HTMLElement, className: string): void;
            setAction(action: string): void;
        };
        internalPlugins: {
            getPluginById(id: string): { instance: any } | null;
        };
        plugins: any;
    }
}

export {};
