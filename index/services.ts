import type { ASTNode } from "ast-types";
import * as recast from "recast";
import path from "node:path";
import ts from "recast/parsers/typescript";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

function nameOfItem(node: ASTNode): string {
    switch (node.type) {
    case "VariableDeclaration":
        return node.declarations[0].id.type === "Identifier" ? node.declarations[0].id.name : throwError("Unsupported variable declaration: " + code(node));
    case "FunctionDeclaration":
        return node.id ? node.id.name : throwError("Anonymous function declaration: " + code(node));
    case "ExportNamedDeclaration":
        if (node.declaration) {
            return nameOfItem(node.declaration);
        } else {
            throwError("Unsupported export named declaration without declaration: " + code(node));
        }
    default:
        throwError("Unsupported item type for naming: " + code(node));
    }
}

/**
 * Return name of the function tested in the given IfStatement node,
 * if it is indeed a Vitest inline test (if (import.meta.vitest) { ... }).)
 *
 * Logic is:
 * - If we destructure `describe`, look for CallExpressions, check the first one's first argument. If it's a string, we assume that it is the function name
 * - If we didn't destructure `describe`, look for the same thing but with the `test` function.
 */
function analyzeVitestImport(node: ASTNode): undefined | string {
    if (node.type !== "IfStatement")
        return undefined;

    if (code(node.test) !== "import.meta.vitest")
        return undefined;

    const first = node.consequent.body.at(0);

    if (first?.type !== "VariableDeclaration")
        return undefined;

    const decl = first.declarations.at(0);

    if (!decl || decl.type !== "VariableDeclarator")
        return undefined;

    const {
        id,
        init
    } = decl;

    if (code(init) !== "import.meta.vitest")
        return undefined;

    if (id.type !== "ObjectPattern")
        return undefined;

    const props = new Set(
        id.properties.filter(p => p.type === "ObjectProperty").map(p => p.key.original.name)
    );

    if (!props.has("describe") && !props.has("test"))
        return undefined;

    const rootTestNames = node.consequent.body.filter(
        s => s.type === "ExpressionStatement" && s.expression.type === "CallExpression" && s.expression.callee.type === "Identifier" && s.expression.callee.name === (props.has("describe") ? "describe" : "test") && s.expression.arguments.at(0)?.type === "StringLiteral"
    ).map(s => s.expression.arguments.at(0)!.value as string);

    if (rootTestNames.length !== 1)
        return undefined;

    return rootTestNames[0];
}