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

const Observation = table(["id", "addedAt", "sessionId"], ObservationSchema);

const Settings = table("id", type({
    id: "\"defaults\" | \"user\"",
    protocols: References,
    theme: type.enumerated("dark", "light", "auto"),

    // TODO(2025-09-05): remove n===10 after a while
    gridSize: type.number.pipe(n => (n === 10 ? 1 : clamp(n, 0.5, 2))),

    notifications: "boolean | null = null",

    language: type.enumerated("fr", "en").default(/** @type {() => 'fr' | 'en'} */
    () => {
        // TODO(2025-10-04): remove paraglide migration after a while

        try {
            const fromParaglide = localStorage.getItem("PARAGLIDE_LOCALE");

            if (fromParaglide === "fr" || fromParaglide === "en") {
                localStorage.removeItem("PARAGLIDE_LOCALE");
                return fromParaglide;
            }
        } catch (e) {
            // ReferenceError => localStorage not defined => not in browser => isok
            if (!(e instanceof ReferenceError))
                console.warn("Error migrating from PARAGLIDE_LOCALE ", e);
        }

        try {
            return localeFromNavigator();
        } catch (e) {
            console.warn("Error getting navigator.language, defaulting to fr", e);
            return "fr";
        }
    }),

    showInputHints: "boolean",
    showTechnicalMetadata: "boolean",
    cropAutoNext: "boolean = false",

    parallelism: type("number").default(() => {
        try {
            return Math.ceil(navigator.hardwareConcurrency / 3);
        } catch (e) {
            console.warn("Couldn't get navigator.hardwareConcurrency, defaulting to 1", e);
            return 1;
        }
    }),

    gallerySort: type({
        direction: type.enumerated("asc", "desc"),
        key: type.enumerated("filename", "date")
    }).configure({
        deprecated: true
    }).default(() => ({
        direction: "asc",
        key: "date"
    })),

    autoUpdateProtocols: type("Record<string, boolean>").default(() => ({}))
}));

export const Schemas = {
    ID,
    FilepathTemplate,
    Probability,
    MetadataValues,
    MetadataValue,
    Image,
    ModelInput,
    ModelDetectionOutputShape,
    Observation,
    Session,
    MetadataInferOptions,
    MetadataTypeSchema,
    MetadataMergeMethod,
    MetadataEnumVariant,
    Metadata,
    Protocol,
    Settings,
    EXIFField,
    HTTPRequest
};

export const Tables = {
    Image,
    ImageFile,
    ImagePreviewFile,
    Observation,
    Session,
    Metadata,
    MetadataOption,
    Protocol,
    Settings
};

/**
 * Returns a comparator to sort objects by their id property
 * If both IDs are numeric, they are compared numerically even if they are strings
 * @template {{id: string|number} | string | number} IdOrObject
 * @param {IdOrObject} a
 * @param {IdOrObject} b
 * @returns {number}
 */
export const idComparator = (a, b) => {
    // @ts-ignore
    if (typeof a === "object" && "id" in a)
        return idComparator(a.id, b.id);

    // @ts-ignore
    if (typeof b === "object" && "id" in b)
        return idComparator(a.id, b.id);

    if (typeof a === "number" && typeof b === "number")
        return a - b;

    if (typeof a === "number")
        return -1;

    if (typeof b === "number")
        return 1;

    if (/^\d+$/.test(a) && /^\d+$/.test(b))
        return Number(a) - Number(b);

    return a.localeCompare(b);
};

/**
 * @typedef  ID
 * @type {typeof ID.infer}
 */

/**
 * @typedef  Probability
 * @type {typeof Probability.infer}
 */

/**
 * @typedef  MetadataValue
 * @type {typeof MetadataValue.infer}
 */

/**
 * @typedef  MetadataValues
 * @type {typeof MetadataValues.infer}
 */

/**
 * @typedef  Image
 * @type {typeof Image.infer}
 */

/**
 * @typedef  Observation
 * @type {typeof Observation.infer}
 */

/**
 * @typedef  Session
 * @type {typeof Session.infer}
 */

/**
 * @typedef  MetadataType
 * @type {typeof MetadataTypeSchema.infer}
 */

/**
 * @typedef  MetadataMergeMethod
 * @type {typeof MetadataMergeMethod.infer}
 */

/**
 * @typedef  MetadataEnumVariant
 * @type {typeof MetadataEnumVariant.infer}
 */

/**
 * @typedef  Metadata
 * @type {typeof Metadata.infer}
 */

/**
 * @typedef  Protocol
 * @type {typeof Protocol.infer}
 */

/**
 * @typedef  ModelInput
 * @type {typeof ModelInput.infer}
 */

/**
 * @typedef  ModelDetectionOutputShape
 * @type {typeof ModelDetectionOutputShape.infer}
 */

/**
 * @typedef  Settings
 * @type {typeof Settings.infer}
 */

/**
 * @typedef  HTTPRequest
 * @type {typeof HTTPRequest.infer}
 */

/**
 * @typedef EXIFField
 * @type {typeof EXIFField.infer}
 */

/**
 * @typedef MetadataInferOptions
 * @type {typeof MetadataInferOptions.infer}
 */

/**
 * @typedef ImageFile
 * @type {typeof ImageFile.infer}
 */

/**
 * @typedef Dimensions
 * @type {typeof Dimensions.infer}
 *
 * @typedef DimensionsInput
 * @type {typeof Dimensions.inferIn}
 */