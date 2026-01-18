(WIP)

the idea is:

1. parse the big file (`file.ts`)  with [recast](https://npmjs.com/package/recast)
2. use a (local) LLM to categorize items (functions, consts, etc) into multiple themes
3. mkdir `file`
4. create one file per theme in `file/`
5. copy all import statements into each of them[^1] 
6. write the relevant functions into their respective files
7. write `file/index.ts`, with `export * from './subfile.js';` for each small file

[^1]: we don't try to analyze deps cuz its hazardous and also, imports can have side effects

have a CLI to do this, and maybe a command to do it automatically on every file based on a SLOC threshold

