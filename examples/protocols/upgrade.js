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

/**
 *
 * Compare the in-database protocol with its remote counterpart, output any changes.
 * @param {import('./idb.svelte.js').DatabaseHandle} db
 * @param {import('$lib/database').ID} protocolId
 * @param {object} [options]
 * @param {(progress: number) => void | Promise<void>} [options.onProgress]
 * @returns {Promise<import('microdiff').Difference[]>}
 */
export async function compareProtocolWithUpstream(
    db,
    protocolId,
    {
        onProgress
    } = {}
) {
    const databaseProtocol = await db.get("Protocol", protocolId).then(Protocol.assert);
    await onProgress?.(0);

    if (!databaseProtocol?.source)
        return [];

    const [remoteProtocol, localProtocol] = await Promise.all([
        fetchHttpRequest(databaseProtocol.source).then(r => r.json()).then(data => ExportedProtocol(data)),
        toExportedProtocol(db, databaseProtocol)
    ]);

    if (remoteProtocol instanceof ArkErrors) {
        console.warn("Remote protocol is invalid", remoteProtocol);
        return [];
    }

    // Sort options for each metadata by key
    const metadataIds = new Set([...keys(remoteProtocol.metadata), ...keys(localProtocol.metadata)]);

    const optionsTotalCount = sum([...metadataIds].map(metadataId => {
        const localMetadata = localProtocol.metadata[metadataId];
        const remoteMetadata = remoteProtocol.metadata[metadataId];

        if (!localMetadata)
            return 0;

        if (!remoteMetadata)
            return 0;

        const localOptionsKeys = localMetadata.options?.map(o => o.key) ?? [];
        const remoteOptionsKeys = remoteMetadata.options?.map(o => o.key) ?? [];
        return new Set([...localOptionsKeys, ...remoteOptionsKeys]).size;
    }));

    // Note: Totals are based on timings on a single machine,
    // the values dont really matter as least as they're self-consistent,
    // it's just to determine what part of the progress bar belongs to fetch+convert
    // It's in ×2ms so that incrementing progress for options is just 1 per option
    let progressCompleted = 0;

    const progressTotals = {
        fetchAndConvert: 250 /* ×2ms */,
        microdiff: 25 /* ×2ms */,
        options: optionsTotalCount /* ×2ms */,
        postProcess: 2 /* ×2ms */
    };

    const incrementProgress = async (amount = 1) => {
        progressCompleted += amount;
        onProgress?.(progressCompleted / sum(Object.values(progressTotals)));
    };

    await incrementProgress(progressTotals.fetchAndConvert);

    const DELETED_OPTION = {
        description: "",
        key: "",
        label: "",
        __deleted: true
    };

    for (const metadataId of metadataIds) {
        if (!remoteProtocol.metadata[metadataId])
            continue;

        if (!localProtocol.metadata[metadataId])
            continue;

        const remoteOptions = remoteProtocol.metadata[metadataId].options ?? [];
        const sortedRemoteOptions = [];
        const localOptions = localProtocol.metadata[metadataId].options ?? [];
        const sortedLocalOptions = [];

        const optionKeys = [
            ...new Set([...remoteOptions.map(o => o.key), ...localOptions.map(o => o.key)])
        ].sort();

        for (const key of optionKeys) {
            const remoteOption = remoteOptions.find(o => o.key === key);
            const localOption = localOptions.find(o => o.key === key);
            sortedLocalOptions.push(localOption ?? DELETED_OPTION);
            sortedRemoteOptions.push(remoteOption ?? DELETED_OPTION);
            await incrementProgress();
        }

        remoteProtocol.metadata[metadataId].options = sortedRemoteOptions;
        localProtocol.metadata[metadataId].options = sortedLocalOptions;
    }

    const diffs = microdiff(remoteProtocol, localProtocol, {
        cyclesFix: true
    });

    await incrementProgress(progressTotals.microdiff);

    // If an option was removed from one side, it'll appear as a all-empty-strings option object with an additional `__deleted: true` property.

    let cleanedDiffs = structuredClone(diffs);

    const diffStartsWith = (path, start) => path.length >= start.length && range(0, start.length).every(i => path[i] === start[i]);

    for (const {
        path,
        type
    } of diffs) {
        const last = path.at(-1);
        const prefix = path.slice(0, -1);

        // If the diff indicates that an option was deleted
        if (last === "__deleted") {
            // __deleted entry was _created_ in localProtocol, so it was a deleted-from-remote option
            if (type === "CREATE") {
                const pathToOption = prefix;

                // Delete all diffs with a path starting with diff.path[..-1]
                cleanedDiffs = cleanedDiffs.filter(d => !diffStartsWith(d.path, pathToOption));

                // and replace them with a single diff indicating the deletion of the option
                cleanedDiffs.push({
                    type: "REMOVE",
                    path: [...prefix],

                    // Restore old value by getting all oldValues from diffs
                    oldValue: fromEntries(
                        diffs.filter(d => diffStartsWith(d.path, pathToOption)).filter(d => d.path.at(-1) !== "__deleted").map(d
                        /** @type {const} */ => ([d.path.at(-1)?.toString() ?? "", d.oldValue]))
                    )
                });
            } else if (type === "REMOVE") {
                // __deleted entry was _removed_ from localProtocol, so it's an option that didn't exist in remoteProtocol
                const pathToOption = prefix;

                // Delete all diffs with a path starting with diff.path[..-1]
                cleanedDiffs = cleanedDiffs.filter(d => !diffStartsWith(d.path, pathToOption));

                // and replace them with a single diff indicating the addition of the option
                cleanedDiffs.push({
                    type: "CREATE",
                    path: [...prefix],

                    value: fromEntries(
                        diffs.filter(d => diffStartsWith(d.path, pathToOption)).filter(d => d.path.at(-1) !== "__deleted").map(d
                        /** @type {const} */ => ([d.path.at(-1)?.toString() ?? "", d.value]))
                    )
                });
            }
        }
    }

    await incrementProgress(progressTotals.postProcess);
    return cleanedDiffs;
}