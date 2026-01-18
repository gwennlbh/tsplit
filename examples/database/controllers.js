import { type } from "arktype";
import { localeFromNavigator } from "./i18n.js";
import { Dimensions, HTTPRequest, ID, ModelInput, Probability, References } from "./schemas/common.js";
import {
    EXIFField,
    MetadataEnumVariant,
    MetadataInferOptions,
    MetadataMergeMethod,
    Metadata as MetadataSchema,
    MetadataType as MetadataTypeSchema,
    MetadataValue,
    MetadataValues,
} from "./schemas/metadata.js";
import { Image as ImageSchema, Observation as ObservationSchema } from "./schemas/observations.js";
import { FilepathTemplate, ModelDetectionOutputShape, Protocol as ProtocolSchema } from "./schemas/protocols.js";
import { Session as SessionSchema } from "./schemas/sessions.js";
import { clamp } from "./utils.js";

/**
 * Generate an ID for a given table
 * @param {keyof typeof Tables} table
 */
export function generateId(table) {
    return table.slice(0, 1).toLowerCase() + Math.random().toString(36).slice(2, 9);
}

if (import.meta.vitest) {
    const {
        test,
        expect
    } = import.meta.vitest;

    test("generateId", () => {
        const id1 = generateId("Protocol");
        const id2 = generateId("Image");
        const id3 = generateId("Observation");
        expect(id1.charAt(0)).toBe("p");
        expect(id2.charAt(0)).toBe("i");
        expect(id3.charAt(0)).toBe("o");
        expect(id1.length).toBe(8); // 1 + 7 random chars
        expect(id2.length).toBe(8);
        expect(id3.length).toBe(8);

        // Should be different each time
        expect(generateId("Protocol")).not.toBe(generateId("Protocol"));

        // Should only contain lowercase letters and digits (base36)
        expect(/^[a-z0-9]+$/.test(id1)).toBe(true);

        expect(/^[a-z0-9]+$/.test(id2)).toBe(true);
    });
}

const ImagePreviewFile = table(["id", "sessionId"], type({
    /** ID of the associated Image object */
    id: ID,

    bytes: "ArrayBuffer",
    filename: "string",
    contentType: /\w+\/\w+/,
    dimensions: Dimensions,
    sessionId: ID
}));

const Image = table(["id", "addedAt", "sessionId"], ImageSchema);

const Metadata = table("id", MetadataSchema.omit("options"));

const MetadataOption = table(["id"], MetadataEnumVariant.and({
    id: [/\w+:\w+/, "@", "ID of the form metadata_id:key"],
    metadataId: ID
}));

const Protocol = table("id", ProtocolSchema);

export const NO_REACTIVE_STATE_TABLES /** @type {const} */ = (["ImageFile", "ImagePreviewFile", "MetadataOption"]);

const SESSION_DEPENDENT_REACTIVE_TABLES /** @type {const} */ = (["Image", "Observation"]);

/**
 *
 * @param {string|string[]} keyPaths expanded to an array.
 * Every element is an index to be created.
 * Indexes are dot-joined paths to keys in the objects.
 * First index is given as the keyPath argument when creating the object store instead.
 * @param {Schema} schema
 * @template {import('arktype').Type} Schema
 * @returns
 */
function table(keyPaths, schema) {
    const expandedKeyPaths = Array.isArray(keyPaths) ? keyPaths.map(keyPath => keyPath) : [keyPaths];

    return schema.configure({
        table: {
            indexes: expandedKeyPaths
        }
    });
}