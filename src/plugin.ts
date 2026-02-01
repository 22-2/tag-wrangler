import {
    Component,
    Keymap,
    Menu,
    Notice,
    parseFrontMatterAliases,
    Plugin,
    SuggestModal,
    type TFile,
    type App,
} from "obsidian";
import { renameTag, findTargets } from "./renaming";
import { Tag } from "./Tag";
import { File } from "./File";
import { around } from "monkey-around";
import { Confirm, use } from "@ophidian/core";

const tagHoverMain = "tag-wrangler:tag-pane";

type TagPageSet = Set<TFile> & { tag?: string };

function onElement(
    el: HTMLElement | Document,
    event: string,
    selector: string,
    callback: (event: Event, targetEl: HTMLElement) => void,
    options?: AddEventListenerOptions
) {
    (el as HTMLElement).on(event, selector, callback, options);
    return () => (el as HTMLElement).off(event, selector, callback, options);
}

function getTagText(el: HTMLElement, selectors: string) {
    return el.find?.(selectors)?.textContent ?? el.querySelector(selectors)?.textContent;
}

export default class TagWrangler extends Plugin {
    use = use.plugin(this);
    pageAliases = new Map<TFile, string[]>();
    tagPages = new Map<string, TagPageSet>();

    tagPage(tag: string) {
        const set = this.tagPages.get(Tag.canonical(tag));
        return set?.values().next().value as TFile | undefined;
    }

    openTagPage(file: TFile, isNew: boolean, newLeaf?: boolean) {
        const openState = {
            eState: isNew ? { rename: "all" } : { focus: true }, // Rename new page, focus existing
            ...(isNew ? { state: { mode: "source" } } : {}), // and set source mode for new page
        };
        return this.app.workspace.getLeaf(newLeaf).openFile(file, openState);
    }

    async createTagPage(tagName: string, newLeaf?: boolean) {
        const tag = new Tag(tagName);
        const tp_evt: { tag: string; file?: TFile | Promise<TFile> } = {
            tag: tag.canonical,
            file: undefined,
        };
        app.workspace.trigger("tag-page:will-create", tp_evt);
        let file = tp_evt.file && (await tp_evt.file);
        if (!file) {
            const baseName = new Tag(tagName).name.split("/").join(" ");
            const folder = this.app.fileManager.getNewFileParent(
                this.app.workspace.getActiveFile()?.path || ""
            );
            const path = this.app.vault.getAvailablePath(
                folder.getParentPrefix() + baseName,
                "md"
            );
            file = await this.app.vault.create(
                path,
                [
                    "---",
                    `Aliases: [ ${JSON.stringify(Tag.toTag(tagName))} ]`,
                    "---",
                    "",
                ].join("\n")
            );
        }
        tp_evt.file = file;
        await this.openTagPage(file, true, newLeaf);
        app.workspace.trigger("tag-page:did-create", tp_evt);
    }

    onload() {
        this.addCommand({
            id: "rename-tag",
            name: "Rename tag",
            callback: () => {
                new TagSuggestModal(this.app, (tag) => {
                    this.rename(Tag.toName(tag));
                }).open();
            },
        });

        this.registerEvent(
            app.workspace.on("editor-menu", (menu, editor) => {
                const token = editor.getClickableTokenAt(editor.getCursor());
                if (token?.type === "tag") this.setupMenu(menu, token.text);
            })
        );

        this.register(
            onElement(document, "contextmenu", ".tag-pane-tag", this.onMenu.bind(this), {
                capture: true,
            })
        );

        this.app.workspace.registerHoverLinkSource(tagHoverMain, {
            display: "Tags View",
            defaultMod: true,
        });

        this.addChild(
            // Tags in the tags view
            new TagPageUIHandler(this, {
                hoverSource: tagHoverMain,
                selector: ".tag-pane-tag",
                container: ".tag-container",
                toTag(el) {
                    return getTagText(
                        el,
                        ".tag-pane-tag-text, tag-pane-tag-text, .tag-pane-tag .tree-item-inner-text"
                    );
                },
            })
        );

        this.addChild(
            // Reading mode / tag links
            new TagPageUIHandler(this, {
                hoverSource: "preview",
                selector: 'a.tag[href^="#"]',
                container: ".markdown-preview-view, .markdown-embed, .workspace-leaf-content",
                toTag(el) {
                    return el.getAttribute("href");
                },
            })
        );

        this.addChild(
            // Property view
            new TagPageUIHandler(this, {
                hoverSource: "preview",
                selector: '.metadata-property[data-property-key="tags"] .multi-select-pill',
                container: ".metadata-properties",
                mergeMenu: true,
                toTag(el) {
                    return el.textContent;
                },
            })
        );

        this.addChild(
            // Edit mode
            new TagPageUIHandler(this, {
                hoverSource: "editor",
                selector: "span.cm-hashtag",
                container: ".markdown-source-view",
                toTag(el) {
                    // Multiple cm-hashtag elements can be side by side: join them all together:
                    let tagName = el.textContent ?? "";
                    if (!el.matches(".cm-formatting"))
                        for (
                            let t = el.previousElementSibling as HTMLElement | null;
                            t?.matches("span.cm-hashtag:not(.cm-formatting)");
                            t = t.previousElementSibling as HTMLElement | null
                        ) {
                            tagName = (t.textContent ?? "") + tagName;
                        }
                    for (
                        let t = el.nextElementSibling as HTMLElement | null;
                        t?.matches("span.cm-hashtag:not(.cm-formatting)");
                        t = t.nextElementSibling as HTMLElement | null
                    ) {
                        tagName += t.textContent ?? "";
                    }
                    return tagName;
                },
            })
        );

        // Tag Drag
        this.register(
            onElement(
                document,
                "pointerdown",
                ".tag-pane-tag",
                (_, targetEl) => {
                    targetEl.draggable = true;
                },
                { capture: true }
            )
        );
        this.register(
            onElement(
                document,
                "dragstart",
                ".tag-pane-tag",
                (event, targetEl) => {
                    const tagName = getTagText(
                        targetEl,
                        ".tag-pane-tag-text, tag-pane-tag-text, .tag-pane-tag .tree-item-inner-text"
                    );
                    const dragEvent = event as DragEvent;
                    dragEvent.dataTransfer?.setData("text/plain", "#" + tagName);
                    app.dragManager.onDragStart(dragEvent, {
                        source: "tag-wrangler",
                        type: "text",
                        title: tagName,
                        icon: "hashtag",
                    });
                    window.addEventListener("dragend", release, true);
                    window.addEventListener("drop", release, true);
                    function release() {
                        app.dragManager.draggable = null;
                        window.removeEventListener("dragend", release, true);
                        window.removeEventListener("drop", release, true);
                    }
                },
                { capture: false }
            )
        );

        const dropHandler = (
            e: DragEvent,
            targetEl: HTMLElement,
            info = app.dragManager.draggable,
            drop?: boolean
        ) => {
            if (info?.source !== "tag-wrangler" || e.defaultPrevented) return;
            const tag = getTagText(
                targetEl,
                ".tag-pane-tag-text, tag-pane-tag-text, .tag-pane-tag .tree-item-inner-text"
            );
            const dest = tag + "/" + Tag.toName(info.title).split("/").pop();
            if (Tag.canonical(tag) === Tag.canonical(info.title)) return;
            if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
            e.preventDefault();
            if (drop) {
                this.rename(Tag.toName(info.title), dest);
            } else {
                app.dragManager.updateHover(targetEl, "is-being-dragged-over");
                app.dragManager.setAction(`Rename to ${dest}`);
            }
        };

        this.register(onElement(document.body, "dragover", ".tag-pane-tag.tree-item-self", dropHandler, { capture: true }));
        this.register(onElement(document.body, "dragenter", ".tag-pane-tag.tree-item-self", dropHandler, { capture: true }));
        // This has to be registered on the window so that it will still get the .draggable
        this.registerDomEvent(
            window,
            "drop",
            (e: DragEvent) => {
                const targetEl = (e.target as HTMLElement | null)?.matchParent?.(
                    ".tag-pane-tag.tree-item-self",
                    e.currentTarget
                ) as HTMLElement | null;
                if (!targetEl) return;
                const info = app.dragManager.draggable;
                if (info && !e.defaultPrevented) dropHandler(e, targetEl, info, true);
            },
            { capture: true }
        );

        // Track Tag Pages
        const metaCache = this.app.metadataCache;
        const plugin = this;

        this.register(
            around(metaCache, {
                getTags(old) {
                    return function getTags(this: typeof metaCache) {
                        const tags = old.call(this) as Record<string, number>;
                        const names = new Set(Object.keys(tags).map((t) => t.toLowerCase()));
                        for (const t of plugin.tagPages.keys()) {
                            if (!names.has(t)) tags[(plugin.tagPages.get(t) as TagPageSet).tag as string] = 0;
                        }
                        return tags;
                    };
                },
            })
        );

        this.app.workspace.onLayoutReady(() => {
            metaCache.getCachedFiles?.().forEach((filename: string) => {
                const fm = metaCache.getCache?.(filename)?.frontmatter;
                if (fm && parseFrontMatterAliases(fm)?.filter(Tag.isTag))
                    this.updatePage(this.app.vault.getAbstractFileByPath(filename) as TFile, fm);
            });
            this.registerEvent(
                metaCache.on("changed", (file, _data, cache) => this.updatePage(file, cache?.frontmatter))
            );
            this.registerEvent(metaCache.on("delete", (file: TFile) => this.updatePage(file)));
            app.workspace.getLeavesOfType("tag").forEach((leaf) => {
                leaf.view.requestUpdateTags?.();
            });
        });
    }

    updatePage(file: TFile, frontmatter?: Record<string, unknown>) {
        const tags = parseFrontMatterAliases(frontmatter)?.filter(Tag.isTag) || [];
        if (this.pageAliases.has(file)) {
            const oldTags = new Set(tags || []);
            for (const tag of this.pageAliases.get(file) || []) {
                if (oldTags.has(tag)) continue; // don't bother deleting what we'll just put back
                const key = Tag.canonical(tag);
                const tp = this.tagPages.get(key);
                if (tp) {
                    tp.delete(file);
                    if (!tp.size) this.tagPages.delete(key);
                }
            }
            if (!tags.length) this.pageAliases.delete(file);
        }
        if (tags.length) {
            this.pageAliases.set(file, tags);
            for (const tag of tags) {
                const key = Tag.canonical(tag);
                if (this.tagPages.has(key)) this.tagPages.get(key)?.add(file);
                else {
                    const tagSet = new Set<TFile>() as TagPageSet;
                    tagSet.add(file);
                    tagSet.tag = Tag.toTag(tag);
                    this.tagPages.set(key, tagSet);
                }
            }
        }
    }

    onMenu(e: Event, tagEl: HTMLElement) {
        let menu = menuForEvent(e);
        const tagName = getTagText(tagEl, ".tag-pane-tag-text, .tag-pane-tag .tree-item-inner-text");
        const isHierarchy = tagEl.parentElement?.parentElement?.find?.(".collapse-icon");
        this.setupMenu(menu, tagName ?? "", !!isHierarchy);
        if (isHierarchy) {
            const tagParent = tagName?.split("/").slice(0, -1).join("/") ?? "";
            const tagView = this.leafView(tagEl.matchParent?.(".workspace-leaf"));
            const tagContainer = tagParent
                ? tagView?.tagDoms?.["#" + tagParent.toLowerCase()]
                : tagView?.root;
            function toggle(collapse: boolean) {
                for (const tag of (tagContainer?.children ?? tagContainer?.vChildren?.children ?? []) as HTMLElement[]) {
                    tag.setCollapsed?.(collapse);
                }
            }
            menu
                .addItem(item("tag-hierarchy", "vertical-three-dots", "Collapse tags at this level", () => toggle(true)))
                .addItem(item("tag-hierarchy", "expand-vertically", "Expand tags at this level", () => toggle(false)));
        }
    }

    setupMenu(menu: Menu, tagName: string, isHierarchy = false) {
        tagName = Tag.toTag(tagName).slice(1);
        const tagPage = this.tagPage(tagName);
        const searchPlugin = (this.app as any).internalPlugins?.getPluginById("global-search");
        const search = searchPlugin && searchPlugin.instance;
        const query = search && search.getGlobalSearchQuery();
        const random = (this.app as any).plugins.plugins["smart-random-note"];

        menu.addItem(item("tag-rename", "pencil", "Rename #" + tagName, () => this.rename(tagName)));

        if (tagPage) {
            menu.addItem(
                item("tag-page", "popup-open", "Open tag page", (e) =>
                    this.openTagPage(tagPage, false, !!Keymap.isModEvent(e as MouseEvent))
                )
            );
        } else {
            menu.addItem(
                item("tag-page", "create-new", "Create tag page", (e) =>
                    this.createTagPage(tagName, !!Keymap.isModEvent(e as MouseEvent))
                )
            );
        }

        if (search) {
            menu.addItem(
                item("tag-search", "magnifying-glass", "New search for #" + tagName, () =>
                    search.openGlobalSearch("tag:#" + tagName)
                )
            );
            if (query) {
                menu.addItem(
                    item("tag-search", "sheets-in-box", "Require #" + tagName + " in search", () =>
                        search.openGlobalSearch(query + " tag:#" + tagName)
                    )
                );
            }
            menu.addItem(
                item("tag-search", "crossed-star", "Exclude #" + tagName + " from search", () =>
                    search.openGlobalSearch(query + " -tag:#" + tagName)
                )
            );
        }

        if (random) {
            menu.addItem(
                item("tag-random", "dice", "Open random note", async () => {
                    const targets = await findTargets(this.app, new Tag(tagName));
                    if (!targets) return;
                    random.openRandomNote(targets.map((f: File) => this.app.vault.getAbstractFileByPath(f.filename)));
                })
            );
        }

        this.app.workspace.trigger("tag-wrangler:contextmenu", menu, tagName, {
            search,
            query,
            isHierarchy,
            tagPage,
        });
    }

    leafView(containerEl: HTMLElement | null) {
        let view: import("obsidian").View | undefined;
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.containerEl === containerEl) {
                view = leaf.view;
                return true;
            }
        });
        return view;
    }

    async rename(tagName: string, toName = tagName) {
        try {
            await renameTag(this.app, tagName, toName);
        } catch (e) {
            console.error(e);
            new Notice("error: " + (e as Error)?.message || String(e));
        }
    }
}

function item(section: string, icon: string, title: string, click: (evt: MouseEvent | KeyboardEvent) => void) {
    return (i: import("obsidian").MenuItem) => {
        i.setIcon(icon).setTitle(title).onClick(click);
        if (section) i.setSection(section);
    };
}

interface UIHandlerOptions {
    selector: string;
    container: string;
    hoverSource: string;
    toTag: (el: HTMLElement) => string | null;
    mergeMenu?: boolean;
}

class TagPageUIHandler extends Component {
    // Handle hovering and clicks-to-open for tag pages

    opts: UIHandlerOptions;
    plugin: TagWrangler;

    constructor(plugin: TagWrangler, opts: UIHandlerOptions) {
        super();
        this.opts = opts;
        this.plugin = plugin;
    }

    onload() {
        const { selector, container, hoverSource, toTag, mergeMenu } = this.opts;
        this.register(
            // Show tag page on hover
            onElement(
                document,
                "mouseover",
                selector,
                (event, targetEl) => {
                    const tagName = toTag(targetEl);
                    const tp = tagName && this.plugin.tagPage(tagName);
                    if (tp)
                        this.plugin.app.workspace.trigger("hover-link", {
                            event,
                            source: hoverSource,
                            targetEl,
                            linktext: tp.path,
                            hoverParent: targetEl.matchParent?.(container),
                        });
                },
                { capture: false }
            )
        );

        const self = this;

        if (hoverSource === "preview") {
            this.register(
                onElement(
                    document,
                    "contextmenu",
                    selector,
                    (e, targetEl) => {
                        if (mergeMenu) {
                            const remove = around(Menu.prototype, {
                                showAtPosition(old) {
                                    return function (...args) {
                                        remove();
                                        const tagName = toTag(targetEl);
                                        if (tagName) self.plugin.setupMenu(this as Menu, tagName);
                                        return old.apply(this, args);
                                    };
                                },
                            });
                            const menuConstructor = Menu as typeof Menu & { forEvent?(e: Event): Menu };
                            if (menuConstructor.forEvent) {
                                const remove2 = around(menuConstructor, {
                                    forEvent(old) {
                                        return function (ev: Event) {
                                            const m = old.call(this, e) as Menu;
                                            if (ev === e) {
                                                const tagName = toTag(targetEl);
                                                if (tagName) self.plugin.setupMenu(m, tagName);
                                                remove();
                                            }
                                            remove2();
                                            return m;
                                        };
                                    },
                                });
                                setTimeout(remove2, 0);
                            }
                            setTimeout(remove, 0);
                            return;
                        }
                        const tagName = toTag(targetEl);
                        if (tagName) this.plugin.setupMenu(menuForEvent(e), tagName);
                    },
                    { capture: !!mergeMenu }
                )
            );
            this.register(
                onElement(
                    document,
                    "dragstart",
                    selector,
                    (event, targetEl) => {
                        const tagName = toTag(targetEl);
                        if (!tagName) return;
                        const dragEvent = event as DragEvent;
                        dragEvent.dataTransfer?.setData("text/plain", Tag.toTag(tagName));
                        app.dragManager.onDragStart(dragEvent, {
                            source: "tag-wrangler",
                            type: "text",
                            title: tagName,
                            icon: "hashtag",
                        });
                    },
                    { capture: false }
                )
            );
        }

        this.register(
            // Open tag page w/alt click (current pane) or ctrl/cmd/middle click (new pane)
            onElement(
                document,
                hoverSource === "editor" ? "mousedown" : "click",
                selector,
                (event, targetEl) => {
                    const { altKey } = event as MouseEvent;
                    const isMod = !!Keymap.isModEvent(event as MouseEvent);
                    if (!isMod && !altKey) return;
                    const tagName = toTag(targetEl);
                    if (!tagName) return;
                    const tp = this.plugin.tagPage(tagName);
                    if (tp) {
                        this.plugin.openTagPage(tp, false, isMod);
                    } else {
                        new Confirm()
                            .setTitle("Create Tag Page")
                            .setContent(`A tag page for ${tagName} does not exist.  Create it?`)
                            .confirm()
                            .then((v) => {
                                if (v) return this.plugin.createTagPage(tagName, isMod);
                                const search = app.internalPlugins?.getPluginById("global-search")?.instance;
                                search?.openGlobalSearch("tag:#" + tagName);
                            });
                    }
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    return false;
                },
                { capture: true }
            )
        );
    }
}

function menuForEvent(e: Event) {
    const menuConstructor = Menu as typeof Menu & { forEvent?(e: Event): Menu };
    if (menuConstructor.forEvent) {
        return (e.obsidian_contextmenu ||= menuConstructor.forEvent(e));
    }
    let menu = e.obsidian_contextmenu as Menu | undefined;
    if (!menu) {
        menu = e.obsidian_contextmenu = new Menu();
        setTimeout(() => menu?.showAtPosition({ x: (e as MouseEvent).pageX, y: (e as MouseEvent).pageY }), 0);
    }
    return menu;
}

class TagSuggestModal extends SuggestModal<string> {
    constructor(app: App, private onSelect: (tag: string) => void) {
        super(app);
    }
    getSuggestions(query: string): string[] {
        const tags = Object.keys(this.app.metadataCache.getTags?.() ?? {});
        query = query.toLowerCase();
        return tags.filter((tag) => tag.toLowerCase().includes(query));
    }
    renderSuggestion(tag: string, el: HTMLElement) {
        el.setText(tag);
    }
    onChooseSuggestion(tag: string, _evt: MouseEvent | KeyboardEvent) {
        this.onSelect(tag);
    }
}
