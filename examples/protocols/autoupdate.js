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