import { Progress } from "./progress";
import { Confirm, Prompt } from "@ophidian/core";
import { Notice, parseFrontMatterAliases, parseFrontMatterTags, type App } from "obsidian";
import { Replacement, Tag } from "./Tag";
import { File } from "./File";

export async function renameTag(app: App, tagName: string, toName = tagName) {
    const newName = await promptForNewName(tagName, toName);
    if (newName === false) return; // aborted

    if (!newName || newName === tagName) {
        return new Notice("Unchanged or empty tag: No changes made.");
    }

    const oldTag = new Tag(tagName);
    const newTag = new Tag(newName);
    const replace = new Replacement(oldTag, newTag);
    const clashing = replace.willMergeTags(allTags(app).reverse()); // find longest clash first
    const shouldAbort = clashing && (await shouldAbortDueToClash(clashing, oldTag, newTag));

    if (shouldAbort) return;

    const targets = await findTargets(app, oldTag);
    if (!targets) return;

    const progress = new Progress(`Renaming to #${newName}/*`, "Processing files...");
    let renamed = 0;
    await progress.forEach(targets, async (target) => {
        progress.message = "Processing " + target.basename;
        if (await target.renamed(replace)) renamed++;
    });

    return new Notice(
        `Operation ${progress.aborted ? "cancelled" : "complete"}: ${renamed} file(s) updated`
    );
}

function allTags(app: App) {
    return Object.keys((app.metadataCache as any).getTags?.() ?? {});
}

export async function findTargets(app: App, tag: Tag) {
    const targets: File[] = [];
    const progress = new Progress(`Searching for ${tag}/*`, "Matching files...");
    const cachedFiles = ((app.metadataCache as any).getCachedFiles?.() ?? []) as string[];
    await progress.forEach(cachedFiles, (filename) => {
        let { frontmatter, tags } = (app.metadataCache as any).getCache(filename) || {};
        tags = (tags || []).filter((t) => t.tag && tag.matches(t.tag)).reverse(); // last positions first
        const fmtags = (parseFrontMatterTags(frontmatter) || []).filter(tag.matches);
        const aliasTags = (parseFrontMatterAliases(frontmatter) || [])
            .filter(Tag.isTag)
            .filter(tag.matches);
        if (tags.length || fmtags.length || aliasTags.length)
            targets.push(new File(app, filename, tags, fmtags.length + aliasTags.length));
    });
    if (!progress.aborted) return targets;
}

async function promptForNewName(tagName: string, newName = tagName) {
    return await new Prompt()
        .setTitle(`Renaming #${tagName} (and any sub-tags)`)
        .setContent("Enter new name (must be a valid Obsidian tag name):\n")
        .setPattern("[^\u2000-\u206F\u2E00-\u2E7F'!\"#$%&\\(\\)*+,.:;<=>?@^`\\{\\|\\}~\\[\\]\\\\\\s]+")
        .onInvalidEntry((t) => new Notice(`"${t}" is not a valid Obsidian tag name`))
        .setValue(newName)
        .prompt();
}

async function shouldAbortDueToClash(
    [origin, clash]: [Tag, Tag],
    oldTag: Tag,
    newTag: Tag
) {
    return !await new Confirm()
        .setTitle("WARNING: No Undo!")
        .setContent(
            (activeWindow as any).createEl("p", undefined, (el: HTMLElement) => {
                el.innerHTML =
                    `Renaming <code>${oldTag}</code> to <code>${newTag}</code> will merge ${
                        origin.canonical === oldTag.canonical
                            ? "these tags"
                            : `multiple tags
                        into existing tags (such as <code>${origin}</code>
                        merging with <code>${clash}</code>)`
                    }.<br><br>
                This <b>cannot</b> be undone.  Do you wish to proceed?`;
            })
        )
        .setup((c) => c.okButton.addClass("mod-warning"))
        .confirm();
}
