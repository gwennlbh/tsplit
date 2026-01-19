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
 *
 * @param {Pick<typeof Schemas.Protocol.infer, 'version'|'source'|'id'>} protocol
 * @returns {Promise< { upToDate: boolean; newVersion: number }>}
 */
export async function hasUpgradeAvailable(
    {
        version,
        source,
        id
    }
) {
    if (!source)
        throw new Error("Le protocole n'a pas de source");

    if (!version)
        throw new Error("Le protocole n'a pas de version");

    if (!id)
        throw new Error("Le protocole n'a pas d'identifiant");

    const response = await fetch(
        cachebust(typeof source === "string" ? source : source.url),
        typeof source !== "string" ? source : {
            headers: {
                Accept: "application/json"
            }
        }
    ).then(r => r.json()).then(type({
        "version?": "number",
        id: "string"
    }).assert);

    if (!response.version)
        throw new Error("Le protocole n'a plus de version");

    if (response.id !== id)
        throw new Error("Le protocole a changé d'identifiant");

    if (response.version > version) {
        return {
            upToDate: false,
            newVersion: response.version
        };
    }

    return {
        upToDate: true,
        newVersion: response.version
    };
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