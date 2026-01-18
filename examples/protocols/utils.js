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

/**
 * @param {object} param0
 * @param {number} [param0.version]
 * @param {import('$lib/database.js').HTTPRequest} param0.source
 * @param {string} param0.id
 * @param {import('swarpc').SwarpcClient<typeof import('$worker/procedures.js').PROCEDURES>} param0.swarpc
 */
export async function upgradeProtocol(
    {
        version,
        source,
        id,
        swarpc
    }
) {
    if (!source)
        throw new Error("Le protocole n'a pas de source");

    if (!version)
        throw new Error("Le protocole n'a pas de version");

    if (!id)
        throw new Error("Le protocole n'a pas d'identifiant");

    if (typeof source !== "string")
        throw new Error("Les requêtes HTTP ne sont pas encore supportées, utilisez une URL");

    const {
        tables
    } = await import("./idb.svelte.js");

    const contents = await fetch(cachebust(source), {
        headers: {
            Accept: "application/json"
        }
    }).then(r => r.text());

    const result = await swarpc.importProtocol({
        contents
    });

    tables.Protocol.refresh(null);
    tables.Metadata.refresh(null);

    const {
        version: newVersion,
        ...rest
    } = result;

    if (newVersion === undefined)
        throw new Error("Le protocole a été importé mais n'a plus de version");

    return {
        version: newVersion,
        ...rest
    };
}