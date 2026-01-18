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
 * Downloads a protocol as a JSON file
 * @param {string} base base path of the app - import `base` from `$app/paths`
 * @param {'yaml'|'json'} format
 * @param {typeof import('./schemas/protocols.js').ExportedProtocol.infer} exportedProtocol
 */
function downloadProtocol(base, format, exportedProtocol) {
    let jsoned = stringifyWithToplevelOrdering(
        format,
        jsonSchemaURL(base),
        exportedProtocol,
        ["id", "name", "source", "authors", "exports", "metadata", "inference"]
    );

    // application/yaml is finally a thing, see https://www.rfc-editor.org/rfc/rfc9512.html
    downloadAsFile(jsoned, `${exportedProtocol.id}.${format}`, `application/${format}`);
}