import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import samples from "./frontmatters_sample.json";
import { Replacement, Tag } from "../src/Tag";
import { replaceFrontMatterText } from "../src/frontmatter";

type SampleFile = { mdFiles: string[] };

function splitFrontmatter(text: string) {
    const parts = text.split(/^---\r?$\n?/m);
    if (parts.length < 3) return { has: false, frontmatter: "" };
    return { has: true, frontmatter: parts[1] };
}

function normalizeField(field: unknown, isAlias: boolean) {
    if (field === undefined || field === null) return [] as string[];
    if (Array.isArray(field)) return field.map((v) => String(v));
    if (typeof field === "string") {
        const parts = field.split(isAlias ? /(^\s+|\s*,\s*|\s+$)/ : /([\s,]+)/);
        return parts.filter((p) => p && /[^\s,]+/.test(p));
    }
    return [String(field)];
}

describe("frontmatters_sample.json", () => {
    it("all sample frontmatters parse and tag replacement is stable", () => {
        const { mdFiles } = samples as SampleFile;
        const replace = new Replacement(
            new Tag("自己探求と価値観"),
            new Tag("自己探求と価値観_改")
        );

        for (const text of mdFiles) {
            const { has, frontmatter } = splitFrontmatter(text);
            const updated = replaceFrontMatterText(text, replace);

            if (!has) {
                expect(updated).toBe(text);
                continue;
            }

            const originalDoc = parseDocument(frontmatter);
            if (originalDoc.errors.length) {
                expect(updated).toBe(text);
                continue;
            }

            const updatedFrontmatter = splitFrontmatter(updated).frontmatter;
            const updatedDoc = parseDocument(updatedFrontmatter);
            expect(updatedDoc.errors.length).toBe(0);

            const originalJson = originalDoc.toJSON() as Record<string, unknown>;
            const updatedJson = updatedDoc.toJSON() as Record<string, unknown>;

            const originalTags = normalizeField(originalJson.tags ?? originalJson.tag, false);
            const updatedTags = normalizeField(updatedJson.tags ?? updatedJson.tag, false);
            const expectedTags = replace.inArray(originalTags, false, false).map((v) => String(v));

            const originalAliases = normalizeField(originalJson.aliases ?? originalJson.alias, true);
            const updatedAliases = normalizeField(updatedJson.aliases ?? updatedJson.alias, true);
            const expectedAliases = replace.inArray(originalAliases, false, true).map((v) => String(v));

            expect(updatedTags).toEqual(expectedTags);
            expect(updatedAliases).toEqual(expectedAliases);
        }
    });

    it("emoji tag renames apply cleanly on sample frontmatters", () => {
        const { mdFiles } = samples as SampleFile;
        const replace = new Replacement(
            new Tag("自己探求と価値観"),
            new Tag("🤖自己探求と価値観")
        );

        for (const text of mdFiles) {
            const { has, frontmatter } = splitFrontmatter(text);
            const updated = replaceFrontMatterText(text, replace);

            if (!has) {
                expect(updated).toBe(text);
                continue;
            }

            const originalDoc = parseDocument(frontmatter);
            if (originalDoc.errors.length) {
                expect(updated).toBe(text);
                continue;
            }

            const updatedFrontmatter = splitFrontmatter(updated).frontmatter;
            const updatedDoc = parseDocument(updatedFrontmatter);
            expect(updatedDoc.errors.length).toBe(0);

            const originalJson = originalDoc.toJSON() as Record<string, unknown>;
            const updatedJson = updatedDoc.toJSON() as Record<string, unknown>;

            const originalTags = normalizeField(originalJson.tags ?? originalJson.tag, false);
            const updatedTags = normalizeField(updatedJson.tags ?? updatedJson.tag, false);
            const expectedTags = replace.inArray(originalTags, false, false).map((v) => String(v));

            const originalAliases = normalizeField(originalJson.aliases ?? originalJson.alias, true);
            const updatedAliases = normalizeField(updatedJson.aliases ?? updatedJson.alias, true);
            const expectedAliases = replace.inArray(originalAliases, false, true).map((v) => String(v));

            expect(updatedTags).toEqual(expectedTags);
            expect(updatedAliases).toEqual(expectedAliases);
        }
    });
});
