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
 * @import { Tables } from './database.js';
 * @import { PROCEDURES } from '$worker/procedures.js';
 * @import * as DB from '$lib/database.js'
 */

/**
 *
 * @param {string} base base path of the app - import `base` from `$app/paths`
 */
export function jsonSchemaURL(base) {
    return `${window.location.origin}${base}/protocol.schema.json`;
}

/**
 * Turn a database-stored protocol into an object suitable for export.
 * @param {import('./idb.svelte.js').DatabaseHandle} db
 * @param {typeof Tables.Protocol.infer} protocol
 */
export async function toExportedProtocol(db, protocol) {
    const allMetadataOptions = await db.getAll("MetadataOption", metadataOptionsKeyRange(protocol.id, null));

    const allMetadataDefs = Object.fromEntries(await db.getAll("Metadata").then(defs => defs.filter(
        def => protocol.metadata.includes(def.id) || protocol.sessionMetadata.includes(def.id)
    ).map(metadata => [metadata.id, {
        ...omit(metadata, "id"),

        options: allMetadataOptions.filter((
            {
                id
            }
        ) => metadataOptionsKeyRange(protocol.id, metadata.id).includes(id)).map(option => omit(option, "id", "metadataId"))
    }])));

    return ExportedProtocol.assert({
        ...omit(protocol, "dirty"),

        exports: {
            ...protocol.exports,

            ...(protocol.exports ? {
                images: {
                    cropped: protocol.exports.images.cropped.toJSON(),
                    original: protocol.exports.images.original.toJSON()
                }
            } : {})
        },

        metadata: pick(
            allMetadataDefs,
            ...protocol.metadata.filter(id => !protocol.sessionMetadata.includes(id))
        ),

        sessionMetadata: pick(allMetadataDefs, ...protocol.sessionMetadata)
    });
}

/**
 * Exports a protocol by ID into a JSON file, and triggers a download of that file.
 * @param {import('./idb.svelte.js').DatabaseHandle} db
 * @param {string} base base path of the app - import `base` from `$app/paths`
 * @param {import("./database").ID} id
 * @param {'json' | 'yaml'} [format='json']
 */
export async function exportProtocol(db, base, id, format = "json") {
    downloadProtocol(
        base,
        format,
        await db.get("Protocol", id).then(Protocol.assert).then(p => toExportedProtocol(db, p))
    );
}

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

/**
 *
 * @param {{metadataOrder?: undefined | string[]}} protocol
 * @returns {import('./utils.js').Comparator< string | { id: string }>}
 */
export function metadataDefinitionComparator(protocol) {
    return (a, b) => {
        if (typeof a !== "string")
            a = a.id;

        if (typeof b !== "string")
            b = b.id;

        if (protocol.metadataOrder) {
            return protocol.metadataOrder.indexOf(a) - protocol.metadataOrder.indexOf(b);
        }

        return idComparator(a, b);
    };
}