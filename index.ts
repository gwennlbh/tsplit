import type { ASTNode } from "ast-types"
import * as recast from "recast"
import ts from "recast/parsers/typescript"

const bigfile = Bun.file(process.argv[2]!)

const bigsource = await bigfile.text()

const stmts: ASTNode[] = recast.parse(bigsource, { parser: ts }).program.body

const imports = stmts.filter((s) => s.type === "ImportDeclaration")

const ITEM_TYPES = new Set([
  "VariableDeclaration",
  "FunctionDeclaration",
  "ExportNamedDeclaration",
])

const items = stmts.filter((s) => ITEM_TYPES.has(s.type))

const unsupportedItems = stmts.filter(
  (s) =>
    !ITEM_TYPES.has(s.type) &&
    s.type !== "ImportDeclaration" &&
    !analyzeVitestImport(s),
)

const inlineTests = Map.groupBy(
  stmts.filter((node) => analyzeVitestImport(node) !== undefined),
  (node) => analyzeVitestImport(node)!,
)

function code(node: ASTNode) {
  return recast.prettyPrint(node).code
}

function categorizeItem(name: string): string {
  // Imagine we uuuuuh have the LLM to categorize things here haha
  const i = Math.floor(Math.random() * 3)

  return ["utils", "services", "controllers"][i]
}

// Throw, but as an expression
function throwError(msg: string): never {
  throw new Error(msg)
}

function nameOfItem(node: ASTNode): string {
  switch (node.type) {
    case "VariableDeclaration":
      return node.declarations[0].id.type === "Identifier"
        ? node.declarations[0].id.name
        : throwError("Unsupported variable declaration")
    case "FunctionDeclaration":
      return node.id
        ? node.id.name
        : throwError("Anonymous function declaration")
    case "ExportNamedDeclaration":
      if (node.declaration) {
        return nameOfItem(node.declaration)
      } else {
        throwError("Unsupported export named declaration without declaration")
      }
    default:
      throwError("Unsupported item type for naming")
  }
}

const categorized = Map.groupBy(items, (item) =>
  categorizeItem(nameOfItem(item)),
)

const files = new Map<string, string>()

for (const [category, items] of categorized.entries()) {
  const content = items.map(code)

  files.set(
    `${bigfile.name?.replace(/\.[jt]s$/, "")}/${category}.ts`,
    content.join("\n\n"),
  )
}

for (const [filename, contents] of files.entries()) {
  console.log(`--- ${filename} ---\n${contents}\n`)
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
  if (node.type !== "IfStatement") return undefined
  if (code(node.test) !== "import.meta.vitest") return undefined
  const first = node.consequent.body.at(0)
  if (first?.type !== "VariableDeclaration") return undefined
  const decl = first.declarations.at(0)
  if (!decl || decl.type !== "VariableDeclarator") return undefined
  const { id, init } = decl
  if (code(init) !== "import.meta.vitest") return undefined
  if (id.type !== "ObjectPattern") return undefined
  const props = new Set(
    id.properties
      .filter((p) => p.type === "ObjectProperty")
      .map((p) => p.key.original.name),
  )
  if (!props.has("describe") && !props.has("test")) return undefined

  const rootTestNames = node.consequent.body
    .filter(
      (s) =>
        s.type === "ExpressionStatement" &&
        s.expression.type === "CallExpression" &&
        s.expression.callee.type === "Identifier" &&
        s.expression.callee.name ===
          (props.has("describe") ? "describe" : "test") &&
        s.expression.arguments.at(0)?.type === "StringLiteral",
    )
    .map((s) => s.expression.arguments.at(0)!.value as string)

  if (rootTestNames.length !== 1) return undefined
  return rootTestNames[0]
}

unsupportedItems.forEach(analyzeVitestImport)

if (unsupportedItems.length > 0) {
  for (const item of unsupportedItems) {
    console.error("- " + recast.print(item).code)
  }

  throw new Error(`Unsupported statements in source file.`)
}
