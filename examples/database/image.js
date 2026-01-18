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

const ImageFile = table(["id", "sessionId"], type({
    /** ID of the associated Image object */
    id: ID,

    bytes: "ArrayBuffer",
    filename: "string",
    contentType: /\w+\/\w+/,
    dimensions: Dimensions,
    sessionId: ID
}));

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