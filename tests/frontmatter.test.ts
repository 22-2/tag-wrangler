import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { replaceFrontMatterText } from "../src/frontmatter";
import { Replacement, Tag } from "../src/Tag";

function extractFrontMatter(text: string) {
    const parts = text.split(/^---\r?$\n?/m);
    return parts.length >= 3 ? parts[1] : "";
}

describe("replaceFrontMatterText", () => {
    it("replaces tags and aliases inside front matter", () => {
        const source = [
            "---",
            "tags: [foo, foo/bar]",
            "aliases: \"hello, #foo, world\"",
            "---",
            "body",
        ].join("\n");

        const replace = new Replacement(new Tag("foo"), new Tag("bar"));
        const updated = replaceFrontMatterText(source, replace);

        const fm = extractFrontMatter(updated);
        const doc = parseDocument(fm);
        const json = doc.toJSON() as Record<string, unknown>;

        expect(json.tags).toEqual(["bar", "bar/bar"]);
        expect(json.aliases).toBe("hello, #bar, world");
    });

    it("leaves non-frontmatter text untouched", () => {
        const source = "No frontmatter here\n#foo\n";
        const replace = new Replacement(new Tag("foo"), new Tag("bar"));
        const updated = replaceFrontMatterText(source, replace);
        expect(updated).toBe(source);
    });
});
