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
 *
 * @param {import('./idb.svelte.js').DatabaseHandle} db
 * @param {import('swarpc').SwarpcClient<typeof PROCEDURES>} swarpc
 */
export async function autoUpdateProtocols(db, swarpc) {
    const protocols = await db.getAll("Protocol").then(ps => ps.map(p => Protocol.assert(p)));
    const _settings = (await db.get("Settings", "user")) ?? (await db.get("Settings", "default"));
    const settings = _settings ? Schemas.Settings.assert(_settings) : undefined;

    const toUpdate = protocols.filter(p => {
        if (settings && p.id in settings.autoUpdateProtocols) {
            return settings.autoUpdateProtocols[p.id];
        }

        return p.updates === "automatic";
    });

    console.info(
        `Auto-updating protocols:`,
        toUpdate.map(p => `${p.id} (${p.name}, v${p.version ?? "<none>"})`)
    );

    const results = await Promise.allSettled(toUpdate.map(async protocol => {
        const {
            upToDate,
            newVersion
        } = await hasUpgradeAvailable(protocol);

        if (upToDate) {
            console.debug(`[Protocol auto-update] Protocol ${protocol.id} is up to date`);
            return;
        }

        console.debug(
            `[Protocol auto-update] Upgrading protocol ${protocol.id} from v${protocol.version} to v${newVersion}`
        );

        return await upgradeProtocol({
            ...protocol,
            swarpc
        });
    }));

    return results.filter(r => r.status === "fulfilled").map(r => r.value).filter(v => v !== undefined);
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

/**
 * Return first metadata that has neural inference
 * @param {DB.Protocol} protocol
 * @param {DB.Metadata[]} metadata definitions of metadata
 * @returns
 */
export function defaultClassificationMetadata(protocol, metadata) {
    const isCandidate = match.case({
        id: "string",
        type: "\"enum\"",
        infer: MetadataInferOptionsNeural
    }, (
        {
            id
        }
    ) => protocol?.metadata.includes(id)).default(() => false);

    return metadata.find(m => isCandidate(m))?.id;
}