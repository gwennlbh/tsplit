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

export * from "./core.js";
export * from "./data.js";
export * from "./reactive.js";