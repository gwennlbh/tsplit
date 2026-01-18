import type { ASTNode } from "ast-types";
import * as recast from "recast";
import path from "node:path";
import ts from "recast/parsers/typescript";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

function main() {
    const bigfilepath = path.resolve(process.argv[2]!);
    const bigfile = Bun.file(bigfilepath);
    const [stem, ...exts] = path.basename(bigfilepath).split(".") as [string, ...string[]];
    const root = path.join(path.dirname(bigfilepath), stem);
    console.log(`creating ${root}`);

    mkdirSync(root, {
        recursive: true
    });

    const ext = exts.join(".");
    const bigsource = readFileSync(bigfilepath, "utf-8");

    const stmts: ASTNode[] = recast.parse(bigsource, {
        parser: ts
    }).program.body;

    const imports = stmts.filter(s => s.type === "ImportDeclaration");
    const ITEM_TYPES = new Set(["VariableDeclaration", "FunctionDeclaration", "ExportNamedDeclaration"]);
    const items = stmts.filter(s => ITEM_TYPES.has(s.type));

    const unsupportedItems = stmts.filter(
        s => !ITEM_TYPES.has(s.type) && s.type !== "ImportDeclaration" && !analyzeVitestImport(s)
    );

    const inlineTests = Map.groupBy(
        stmts.filter(node => analyzeVitestImport(node) !== undefined),
        node => analyzeVitestImport(node)!
    );

    const categorized = Map.groupBy(items, item => categorizeItem(nameOfItem(item)));
    const categories = [...categorized.keys()];

    console.log({
        categories
    });

    const files = new Map<string, string>();

    for (const [category, items] of categorized.entries()) {
        const content = code(imports) + "\n\n" + code(
            items.flatMap(item => [item, ...(inlineTests.get(nameOfItem(item)) ?? [])]),
            2
        );

        files.set(path.join(root, `${category}.${ext}`), content);
    }

    files.set(
        path.join(root, `index.${ext}`),
        code(imports) + "\n\n" + categories.map(filepath => {
            const name = path.basename(filepath);
            return `export * from "./${name}.${ext}";`;
        }).join("\n")
    );

    for (const [filename, contents] of files.entries()) {
        console.log(`writing ${filename}`);
        writeFileSync(filename, contents);
    }

    unsupportedItems.forEach(analyzeVitestImport);

    if (unsupportedItems.length > 0) {
        for (const item of unsupportedItems) {
            console.error("- " + recast.print(item).code);
        }

        throw new Error(`Unsupported statements in source file.`);
    }
}

function categorizeItem(name: string): string {
    // Imagine we uuuuuh have the LLM to categorize things here haha
    const i = Math.floor(Math.random() * 3);

    return ["utils", "services", "controllers"][i];
}