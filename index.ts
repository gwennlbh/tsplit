import type { ASTNode } from "ast-types"
import * as recast from "recast"
import { createOllama } from "ollama-ai-provider-v2"
import path from "node:path"
import { generateText, Output, streamText } from "ai"
import ts from "recast/parsers/typescript"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { type } from "arktype"

async function main() {
  const bigfilepath = path.resolve(process.argv[2]!)

  const bigfile = Bun.file(bigfilepath)

  const [stem, ...exts] = path.basename(bigfilepath).split(".") as [
    string,
    ...string[],
  ]

  const root = path.join(path.dirname(bigfilepath), stem)

  console.log(`creating ${root}`)

  mkdirSync(root, { recursive: true })

  const ext = exts.join(".")

  const bigsource = readFileSync(bigfilepath, "utf-8")

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
  const ollama = createOllama({
    baseURL: "http://localhost:11434/api",
  })

  const byName = Object.fromEntries(
    items.map((item) => [nameOfItem(item), item]),
  )

  let categories = process.argv.slice(3)

  if (categories.length === 0) {
    console.log("Generating categories...")
    const response = await generateText({
      model: ollama("deepseek-r1:8b"),
      system: `You are a code analyzer. You will be given a list of signatures for source code items (functions, constants, etc). Your task is to suggest a concise set of categories that can be used to organize these items based on their functionality or purpose. Categories are single words, all-lowercase, and MUST NOT be "index" or "${stem}".`,
      prompt: structuredClone(items).map(signature).join("\n"),
      output: Output.array({
        element: type.string,
      }),
    })

    categories = response.output
  }

  console.log("Categorizing...", categories)
  const response = streamText({
    model: ollama("deepseek-r1:8b"),
    system: `You are a code analyzer. You will be given a list of item names (functions, constants, etc) extracted from a source code file. Your task is to categorize these items into the following categories: ${categories.map((c) => JSON.stringify(c)).join(", ")}`,
    prompt: Object.keys(byName)
      .map((name) => `- ${name}`)
      .join("\n"),
    output: Output.array({
      element: type({
        item: "string",
        category: type.enumerated(...categories),
      }),
    }),
  })

  let seenItems = new Set<string>()
  for await (const chunk of response.partialOutputStream) {
    for (const { item, category } of chunk) {
      if (seenItems.has(item)) continue
      console.info(`${item} => ${category}`)
      seenItems.add(item)
    }
  }

  const categorized = await response.output.then((pairs) => {
    return Map.groupBy(
      pairs.map((p) => byName[p.item]!),
      (item) => pairs.find((p) => nameOfItem(item) === p.item)!.category,
    )
  })

  console.log({ categories })

  const files = new Map<string, string>()

  for (const [category, items] of categorized.entries()) {
    const content =
      code(imports) +
      "\n\n" +
      code(
        items.flatMap((item) => [
          item,
          ...(inlineTests.get(nameOfItem(item)) ?? []),
        ]),
        2,
      )

    files.set(path.join(root, `${category}.${ext}`), content)
  }

  files.set(
    path.join(root, `index.${ext}`),
    code(imports) +
      "\n\n" +
      categories
        .map((filepath) => {
          const name = path.basename(filepath)
          return `export * from "./${name}.${ext}";`
        })
        .join("\n"),
  )

  for (const [filename, contents] of files.entries()) {
    console.log(`writing ${filename}`)
    writeFileSync(filename, contents)
  }

  unsupportedItems.forEach(analyzeVitestImport)

  if (unsupportedItems.length > 0) {
    for (const item of unsupportedItems) {
      console.error("- " + recast.print(item).code)
    }

    throw new Error(`Unsupported statements in source file.`)
  }
}

function normalCode(
  node: ASTNode | ASTNode[],
  join: string | number = 1,
): string {
  if (Array.isArray(node)) {
    return node
      .map((n) => normalCode(n))
      .join(typeof join === "string" ? join : "\n".repeat(join))
  }
  return recast.prettyPrint(node).code
}

function code(node: ASTNode | ASTNode[], newlines = 1): string {
  if (Array.isArray(node)) {
    return node.map((n) => normalCode(n)).join("\n".repeat(newlines))
  }
  return recast.print(node).code
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
        : throwError("Unsupported variable declaration: " + normalCode(node))
    case "FunctionDeclaration":
      return node.id
        ? node.id.name
        : throwError("Anonymous function declaration: " + normalCode(node))
    case "ExportNamedDeclaration":
      if (node.declaration) {
        return nameOfItem(node.declaration)
      } else {
        throwError(
          "Unsupported export named declaration without declaration: " +
            normalCode(node),
        )
      }
    default:
      throwError("Unsupported item type for naming: " + normalCode(node))
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
  if (node.type !== "IfStatement") return undefined
  if (normalCode(node.test) !== "import.meta.vitest") return undefined
  const first = node.consequent.body.at(0)
  if (first?.type !== "VariableDeclaration") return undefined
  const decl = first.declarations.at(0)
  if (!decl || decl.type !== "VariableDeclarator") return undefined
  const { id, init } = decl
  if (normalCode(init) !== "import.meta.vitest") return undefined
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

function signature(node: ASTNode): string | undefined {
  switch (node.type) {
    case "ExportNamedDeclaration": {
      const sign = { ...node }
      delete sign.declaration.body
      return normalCode(sign)
    }
    case "FunctionDeclaration": {
      const sign = { ...node }
      delete sign.body
      return normalCode(sign)
    }
    case "VariableStatement": {
      const sign = node.declarations[0]
      delete sign.init
      return normalCode(sign)
    }
    default:
      console.warn("Unsupported signature extraction for: " + normalCode(node))
      return undefined
  }
}

await main()
