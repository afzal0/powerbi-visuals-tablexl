import powerbi from "powerbi-visuals-api";
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import PrivilegeStatus = powerbi.PrivilegeStatus;

import { bytesToBase64, arrayBufferToBase64 } from "./base64";

/** The download service refuses payloads above 30 MB. */
export const MAX_DOWNLOAD_BYTES = 30 * 1024 * 1024;

export type ExportKind = "csv" | "xlsx" | "pdf";

export interface DownloadOutcome {
    ok: boolean;
    message?: string;
}

/**
 * Availability of the download service, which depends on both the host
 * environment (Desktop and the Service only) and the "allow downloads from
 * custom visuals" tenant setting.
 */
export async function checkExportAvailability(host: IVisualHost): Promise<DownloadOutcome> {
    const service = host.downloadService;
    if (!service || typeof service.exportStatus !== "function") {
        return { ok: false, message: "Exporting is not supported in this host." };
    }
    try {
        const status = await service.exportStatus();
        switch (status) {
            case PrivilegeStatus.Allowed:
                return { ok: true };
            case PrivilegeStatus.NotDeclared:
                return { ok: false, message: "Export privilege is not declared." };
            case PrivilegeStatus.NotSupported:
                return { ok: false, message: "Exporting is not supported in this host." };
            case PrivilegeStatus.DisabledByAdmin:
                return {
                    ok: false,
                    message: "Your administrator has turned off downloads from custom visuals."
                };
            default:
                return { ok: false, message: "Exporting is unavailable." };
        }
    } catch {
        return { ok: false, message: "Exporting is unavailable." };
    }
}

function sanitizeFileName(name: string): string {
    const cleaned = name.replace(/[\\/:*?"<>|]/g, "-").trim();
    return cleaned.length > 0 ? cleaned.slice(0, 80) : "table-export";
}

/**
 * Hands a file to the host's download service.
 *
 * Text formats are passed through verbatim, while binary formats must be sent
 * as base64 with the literal file type "base64" — the real extension is taken
 * from the file name.
 */
export async function downloadFile(
    host: IVisualHost,
    kind: ExportKind,
    baseName: string,
    payload: string | Uint8Array | ArrayBuffer,
    description: string
): Promise<DownloadOutcome> {
    const availability = await checkExportAvailability(host);
    if (!availability.ok) {
        return availability;
    }

    let content: string;
    let fileType: string;

    if (typeof payload === "string") {
        content = payload;
        fileType = kind;
    } else {
        const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
        if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
            return {
                ok: false,
                message: "The export is larger than the 30 MB download limit."
            };
        }
        content =
            payload instanceof Uint8Array
                ? bytesToBase64(payload)
                : arrayBufferToBase64(payload as ArrayBuffer);
        fileType = "base64";
    }

    try {
        const accepted = await host.downloadService.exportVisualsContent(
            content,
            `${sanitizeFileName(baseName)}.${kind}`,
            fileType,
            description
        );
        return accepted
            ? { ok: true }
            : { ok: false, message: "The download was cancelled." };
    } catch {
        return { ok: false, message: "The download could not be completed." };
    }
}
