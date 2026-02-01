import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { replaceFrontMatterText } from "../src/frontmatter";
import { Replacement, Tag } from "../src/Tag";

function extractFrontmatter(text: string) {
    const parts = text.split(/^---\r?$\n?/m);
    return parts.length >= 3 ? parts[1] : "";
}

describe("replaceFrontMatterText advanced YAML", () => {
    it("handles block scalars without parse errors", () => {
        const source = [
            "---",
            "tags: |",
            "  foo",
            "  foo/bar",
            "aliases: |",
            "  hello, #foo, world",
            "---",
            "body",
        ].join("\n");

        const replace = new Replacement(new Tag("foo"), new Tag("bar"));
        const updated = replaceFrontMatterText(source, replace);

        const fm = extractFrontmatter(updated);
        const doc = parseDocument(fm);
        expect(doc.errors.length).toBe(0);
    });

    it("preserves YAML anchors and aliases without crashing", () => {
        const source = [
            "---",
            "tags: &t",
            "  - foo",
            "  - foo/bar",
            "aliases: *t",
            "---",
            "body",
        ].join("\n");

        const replace = new Replacement(new Tag("foo"), new Tag("bar"));
        const updated = replaceFrontMatterText(source, replace);

        const fm = extractFrontmatter(updated);
        const doc = parseDocument(fm);
        expect(doc.errors.length).toBe(0);

        const json = doc.toJSON() as Record<string, unknown>;
        expect(json.tags).toEqual(["bar", "bar/bar"]);
        expect(json.aliases).toEqual(["bar", "bar/bar"]);
    });
});
