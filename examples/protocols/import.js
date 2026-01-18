import { ArkErrors, match, type } from "arktype";
import microdiff from "microdiff";
import { idComparator, Schemas } from "./database.js";
import { downloadAsFile, stringifyWithToplevelOrdering } from "./download.js";
import { promptForFiles } from "./files.js";
import { errorMessage } from "./i18n.js";
import { metadataOptionsKeyRange } from "./metadata/index.js";
import { MetadataInferOptionsNeural } from "./schemas/metadata.js";
import { ExportedProtocol, Protocol } from "./schemas/protocols.js";
import { cachebust, fetchHttpRequest, fromEntries, keys, omit, pick, range, sum } from "./utils.js";

/**
 * Imports protocol(s) from JSON file(s).
 * Asks the user to select files, then imports the protocols from those files.
 * @template {{id: string, name: string, version: number|undefined}} Out
 * @template {boolean|undefined} Multiple
 * @param {object} param0
 * @param {Multiple} param0.allowMultiple allow the user to select multiple files
 * @param {() => void} [param0.onInput] callback to call when the user selected files
 * @param {((input: {contents: string, isJSON: boolean}) => Promise<{id: string, name: string, version: number|undefined}>)} param0.importProtocol
 * @returns {Promise<Multiple extends true ? NoInfer<Out>[] : NoInfer<Out>>}
 */
export async function promptAndImportProtocol(
    {
        allowMultiple,
        onInput = () => {},
        importProtocol
    }
) {
    const files = await promptForFiles({
        multiple: allowMultiple,
        accept: ".json,.yaml,application/json"
    });

    onInput();

    /** @type {Array<{id: string, name: string, version: number | undefined}>}  */
    const output = await Promise.all([...files].map(async file => {
        console.time(`Reading file ${file.name}`);
        const reader = new FileReader();

        return new Promise(resolve => {
            reader.onload = async () => {
                if (!reader.result)
                    throw new Error("Fichier vide");

                if (reader.result instanceof ArrayBuffer)
                    throw new Error("Fichier binaire");

                console.timeEnd(`Reading file ${file.name}`);

                const result = await importProtocol({
                    contents: reader.result,
                    isJSON: file.name.endsWith(".json")
                }).catch(err => Promise.reject(new Error(errorMessage(err))));

                const {
                    tables
                } = await import("./idb.svelte.js");

                await tables.Protocol.refresh(null);
                await tables.Metadata.refresh(null);
                resolve(result);
            };

            reader.readAsText(file);
        });
    }));

    return allowMultiple ? output : output[0];
}