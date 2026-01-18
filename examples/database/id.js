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