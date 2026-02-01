import { describe, expect, it } from "vitest";
import { Replacement, Tag } from "../src/Tag";

const validTags = [
    "#🤖",
    "#🧠/思考",
    "#emoji_混在",
    "#💡idea",
    "#タグ/🤖/mix",
    "#a_b-c",
    "#🇯🇵",
];

const invalidTags = [
    "#with space",
    "#bad,comma",
    "#bad:semicolon;",
    "#bad.dot.",
    "#bad:colon",
    "#bad?question",
    "#bad[bracket]",
    "#bad\\slash",
    "#bad\nnewline",
    "#",
    "#👩‍💻",
    "#👨🏽‍🔧",
    "#👩‍👩‍👧‍👦",
    "#🏳️‍🌈",
    "#🧑‍🚀/mission",
];

describe("Tag.isTag edge cases", () => {
    it("accepts emoji and mixed unicode tags", () => {
        for (const tag of validTags) {
            expect(Tag.isTag(tag)).toBe(true);
        }
    });

    it("rejects whitespace and punctuation invalid tags", () => {
        for (const tag of invalidTags) {
            expect(Tag.isTag(tag)).toBe(false);
        }
    });
});

describe("Replacement with emoji tags", () => {
    it("replaces emoji tag hierarchies", () => {
        const replace = new Replacement(new Tag("🤖"), new Tag("🧠"));
        const out = replace.inArray(["#🤖", "#🤖/sub", "#keep"]);
        expect(out).toEqual(["#🧠", "#🧠/sub", "#keep"]);
    });

    it("replaces ZWJ emoji tags", () => {
        const replace = new Replacement(new Tag("👩‍💻"), new Tag("🧑‍🚀"));
        const out = replace.inArray(["#👩‍💻", "#👩‍💻/dev", "#keep"]);
        expect(out).toEqual(["#🧑‍🚀", "#🧑‍🚀/dev", "#keep"]);
    });

    it("replaces flag emoji tags", () => {
        const replace = new Replacement(new Tag("🇯🇵"), new Tag("🇺🇸"));
        const out = replace.inArray(["#🇯🇵", "#🇯🇵/travel", "#keep"]);
        expect(out).toEqual(["#🇺🇸", "#🇺🇸/travel", "#keep"]);
    });

    it("replaces emoji names without # in frontmatter arrays", () => {
        const replace = new Replacement(new Tag("🤖"), new Tag("🧠"));
        const out = replace.inArray(["🤖", "🤖/sub", "keep"], false, false);
        expect(out).toEqual(["🧠", "🧠/sub", "keep"]);
    });

    it("replaces emoji aliases in strings", () => {
        const replace = new Replacement(new Tag("🤖"), new Tag("🧠"));
        const out = replace.inArray(["hello", ", ", "#🤖", ", ", "world"], true, true);
        expect(out).toEqual(["hello", ", ", "#🧠", ", ", "world"]);
    });
});
