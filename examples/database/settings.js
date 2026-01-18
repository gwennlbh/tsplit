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