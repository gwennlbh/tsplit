import type { ASTNode } from "ast-types";
import * as recast from "recast";
import path from "node:path";
import ts from "recast/parsers/typescript";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

function code(node: ASTNode | ASTNode[], newlines = 1): string {
    if (Array.isArray(node)) {
        return node.map(n => code(n)).join("\n".repeat(newlines));
    }

    return recast.prettyPrint(node).code;
}

// Throw, but as an expression
function throwError(msg: string): never {
    throw new Error(msg);
}