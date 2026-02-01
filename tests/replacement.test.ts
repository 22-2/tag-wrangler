import { describe, expect, it } from "vitest";
import { Replacement, Tag } from "../src/Tag";

describe("Replacement.inArray", () => {
    it("replaces direct tag matches", () => {
        const replace = new Replacement(new Tag("foo"), new Tag("bar"));
        const out = replace.inArray(["#foo", "#nope"]);
        expect(out).toEqual(["#bar", "#nope"]);
    });

    it("replaces hierarchical tag matches", () => {
        const replace = new Replacement(new Tag("foo"), new Tag("bar"));
        const out = replace.inArray(["#foo/baz", "#foo/baz/qux"]);
        expect(out).toEqual(["#bar/baz", "#bar/baz/qux"]);
    });

    it("skips non-tag alias entries", () => {
        const replace = new Replacement(new Tag("foo"), new Tag("bar"));
        const out = replace.inArray(["#foo", "not-a-tag", "#foo/baz"], false, true);
        expect(out).toEqual(["#bar", "not-a-tag", "#bar/baz"]);
    });
});
