import { CST, parseDocument } from "yaml";
import { Replacement } from "./Tag";

type ErrorReporter = (message: string) => void;

type FrontMatterSplit = {
    empty: string;
    frontMatter: string | undefined;
};

function splitFrontMatter(text: string): FrontMatterSplit {
    const [empty, frontMatter] = text.split(/^---\r?$\n?/m, 2);
    return { empty, frontMatter };
}

function isValidFrontMatter(empty: string, frontMatter: string | undefined): frontMatter is string {
    return empty.trim() === "" && !!frontMatter?.trim() && frontMatter.endsWith("\n");
}

export function replaceFrontMatterText(
    text: string,
    replace: Replacement,
    onError?: ErrorReporter
): string {
    const { empty, frontMatter } = splitFrontMatter(text);

    // Check for valid, non-empty, properly terminated front matter
    if (!isValidFrontMatter(empty, frontMatter)) return text;

    const parsed = parseDocument(frontMatter, { keepSourceTokens: true });
    if (parsed.errors.length) {
        const error = parsed.errors[0];
        onError?.(`${error}`);
        return text;
    }

    let changed = false;
    const json = parsed.toJSON() as Record<string, unknown>;

    function setInNode(node: any, value: string, afterKey = false) {
        CST.setScalarValue(node.srcToken, value, { afterKey });
        changed = true;
        node.value = value;
    }

    function processStringField(node: any, field: string, isAlias: boolean) {
        const parts = field.split(isAlias ? /(^\s+|\s*,\s*|\s+$)/ : /([\s,]+)/);
        const after = replace.inArray(parts, true, isAlias).join("");
        if (field !== after) setInNode(node, after, true);
    }

    function processArrayField(node: any, field: unknown[], isAlias: boolean) {
        replace.inArray(field, false, isAlias).forEach((value, index) => {
            if (field[index] !== value) setInNode(node.get(index, true), String(value));
        });
    }

    function processField(prop: string, isAlias: boolean) {
        const node = parsed.get(prop, true);
        if (!node) return;
        const field = json[prop];
        if (!field) return;

        if (typeof field === "string") {
            if (!field.length) return;
            processStringField(node, field, isAlias);
        } else if (Array.isArray(field)) {
            if (!field.length) return;
            processArrayField(node, field, isAlias);
        }
    }

    const items = (parsed.contents as any)?.items ?? [];
    for (const { key: { value: prop } } of items) {
        if (/^tags?$/i.test(prop)) {
            processField(prop, false);
        } else if (/^alias(es)?$/i.test(prop)) {
            processField(prop, true);
        }
    }

    return changed
        ? text.replace(frontMatter, CST.stringify((parsed.contents as any).srcToken))
        : text;
}
