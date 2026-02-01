const tagBody = /^#[^\u2000-\u206F\u2E00-\u2E7F'!"#$%&()*+,.:;<=>?@^`{|}~\[\]\\\s]+$/;

export class Tag {
    tag: string;
    canonical: string;
    canonical_prefix: string;
    name: string;
    matches: (text: string) => boolean;

    constructor(name: string) {
        const hashed = (this.tag = Tag.toTag(name));
        const canonical = (this.canonical = hashed.toLowerCase());
        const canonical_prefix = (this.canonical_prefix = canonical + "/");
        this.name = hashed.slice(1);
        this.matches = function (text: string) {
            const value = text.toLowerCase();
            return value === canonical || value.startsWith(canonical_prefix);
        };
    }

    toString() {
        return this.tag;
    }

    static isTag(s: string) {
        return tagBody.test(s);
    }

    static toTag(name: string) {
        while (name.startsWith("##")) name = name.slice(1);
        return name.startsWith("#") ? name : "#" + name;
    }

    static toName(tag: string) {
        return this.toTag(tag).slice(1);
    }

    static canonical(name: string) {
        return Tag.toTag(name).toLowerCase();
    }
}

export class Replacement {
    inString: (text: string, pos?: number) => string;
    inArray: (tags: unknown[], skipOdd?: boolean, isAlias?: boolean) => unknown[];
    willMergeTags: (tagNames: string[]) => [Tag, Tag] | undefined;

    constructor(fromTag: Tag, toTag: Tag) {
        const cache: Record<string, string> = Object.assign(Object.create(null), {
            [fromTag.tag]: toTag.tag,
            [fromTag.name]: toTag.name,
        });

        const canonicalPrefix = fromTag.canonical_prefix;
        const fromNameLower = fromTag.name.toLowerCase();
        const toName = toTag.name;

        const replaceTagString = (text: string, pos = 0) =>
            text.slice(0, pos) + toTag.tag + text.slice(pos + fromTag.tag.length);

        const replaceArrayEntry = (entry: unknown, isAlias: boolean): unknown => {
            if (!entry || typeof entry !== "string") return entry;
            if (isAlias) {
                if (!entry.startsWith("#") || !Tag.isTag(entry)) return entry;
            } else if (/[ ,\n]/.test(entry)) {
                return this.inArray(entry.split(/([, \n]+)/), true).join("");
            }

            if (cache[entry]) return cache[entry];

            const lower = entry.toLowerCase();
            if (cache[lower]) return (cache[entry] = cache[lower]);

            if (lower.startsWith(canonicalPrefix)) {
                return (cache[entry] = cache[lower] = replaceTagString(entry));
            }

            if (("#" + lower).startsWith(canonicalPrefix)) {
                return (cache[entry] = cache[lower] = replaceTagString("#" + entry).slice(1));
            }

            if (lower === fromNameLower) {
                return (cache[entry] = cache[lower] = toName);
            }

            if (lower.startsWith(fromNameLower + "/")) {
                return (cache[entry] = cache[lower] = toName + entry.slice(fromNameLower.length));
            }

            return (cache[entry] = cache[lower] = entry);
        };

        this.inString = replaceTagString;

        this.inArray = (tags, skipOdd = false, isAlias = false) => {
            return tags.map((value, index) => {
                if (skipOdd && (index & 1)) return value;
                return replaceArrayEntry(value, isAlias);
            });
        };

        this.willMergeTags = function (tagNames: string[]) {
            // Renaming to change case doesn't lose info, so ignore it
            if (fromTag.canonical === toTag.canonical) return;

            const existing = new Set(tagNames.map((s) => s.toLowerCase()));

            for (const tagName of tagNames.filter(fromTag.matches)) {
                const changed = replaceTagString(tagName);
                if (existing.has(changed.toLowerCase())) return [new Tag(tagName), new Tag(changed)];
            }
        };
    }
}
