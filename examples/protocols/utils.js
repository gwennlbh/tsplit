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