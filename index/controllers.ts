import type { ASTNode } from "ast-types";
import * as recast from "recast";
import path from "node:path";
import ts from "recast/parsers/typescript";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

function categorizeItem(name: string): string {
    // Imagine we uuuuuh have the LLM to categorize things here haha
    const i = Math.floor(Math.random() * 3);

    return ["utils", "services", "controllers"][i];
}