import { Notice, TFile, type App, type TagCache } from "obsidian";
import { Replacement } from "./Tag";
import { replaceFrontMatterText } from "./frontmatter";

export class File {
    app: App;
    filename: string;
    basename: string;
    tagPositions: TagCache[];
    hasFrontMatter: boolean;

    constructor(app: App, filename: string, tagPositions: TagCache[], hasFrontMatter: number | boolean) {
        this.app = app;
        this.filename = filename;
        this.basename = filename.split("/").pop() ?? filename;
        this.tagPositions = tagPositions;
        this.hasFrontMatter = !!hasFrontMatter;
    }

    /** @param replace Replacement */
    async renamed(replace: Replacement) {
        const file = this.app.vault.getAbstractFileByPath(this.filename);
        if (!(file instanceof TFile)) {
            const msg = `File ${this.filename} not found; skipping`;
            new Notice(msg);
            console.error(msg);
            return;
        }

        const original = await this.app.vault.read(file);
        let text = original;

        for (const { position: { start, end }, tag } of this.tagPositions) {
            if (text.slice(start.offset, end.offset) !== tag) {
                const msg = `File ${this.filename} has changed; skipping`;
                new Notice(msg);
                console.error(msg);
                console.debug(text.slice(start.offset, end.offset), tag);
                return;
            }
            text = replace.inString(text, start.offset);
        }

        if (this.hasFrontMatter) {
            text = this.replaceInFrontMatter(text, replace);
        }

        if (text !== original) {
            await this.app.vault.modify(file, text);
            return true;
        }
    }

    /** @param replace Replacement */
    replaceInFrontMatter(text: string, replace: Replacement) {
        return replaceFrontMatterText(text, replace, (error) => {
            const msg = `YAML issue with ${this.filename}: ${error}`;
            console.error(msg);
            new Notice(msg + "; skipping frontmatter");
        });
    }
}
