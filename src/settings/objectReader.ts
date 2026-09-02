import powerbi from "powerbi-visuals-api";
import DataViewObjects = powerbi.DataViewObjects;

/**
 * Minimal typed readers over a DataViewObjects bag. The formatting-model
 * service only hydrates visual-level objects, so per-column settings (which
 * live on DataViewMetadataColumn.objects) have to be read directly.
 */

function raw(objects: DataViewObjects | undefined, objectName: string, propertyName: string): unknown {
    const bag = objects?.[objectName];
    if (!bag) {
        return undefined;
    }
    return (bag as Record<string, unknown>)[propertyName];
}

export function readBool(
    objects: DataViewObjects | undefined,
    objectName: string,
    propertyName: string,
    defaultValue: boolean
): boolean {
    const value = raw(objects, objectName, propertyName);
    return typeof value === "boolean" ? value : defaultValue;
}

export function readNumber(
    objects: DataViewObjects | undefined,
    objectName: string,
    propertyName: string,
    defaultValue: number
): number {
    const value = raw(objects, objectName, propertyName);
    return typeof value === "number" && isFinite(value) ? value : defaultValue;
}

/** Numeric property that is meaningfully "unset" rather than zero. */
export function readOptionalNumber(
    objects: DataViewObjects | undefined,
    objectName: string,
    propertyName: string
): number | null {
    const value = raw(objects, objectName, propertyName);
    return typeof value === "number" && isFinite(value) ? value : null;
}

export function readText(
    objects: DataViewObjects | undefined,
    objectName: string,
    propertyName: string,
    defaultValue: string
): string {
    const value = raw(objects, objectName, propertyName);
    return typeof value === "string" ? value : defaultValue;
}

/** Enumeration properties round-trip as plain strings. */
export function readEnum<T extends string>(
    objects: DataViewObjects | undefined,
    objectName: string,
    propertyName: string,
    allowed: readonly T[],
    defaultValue: T
): T {
    const value = raw(objects, objectName, propertyName);
    if (typeof value === "string" && (allowed as readonly string[]).indexOf(value) >= 0) {
        return value as T;
    }
    return defaultValue;
}

/** Fill properties arrive as { solid: { color } }. */
export function readFill(
    objects: DataViewObjects | undefined,
    objectName: string,
    propertyName: string,
    defaultValue: string
): string {
    const color = readOptionalFill(objects, objectName, propertyName);
    return color ?? defaultValue;
}

export function readOptionalFill(
    objects: DataViewObjects | undefined,
    objectName: string,
    propertyName: string
): string | null {
    const value = raw(objects, objectName, propertyName) as
        | { solid?: { color?: string } }
        | undefined;
    const color = value?.solid?.color;
    return typeof color === "string" && color.length > 0 ? color : null;
}
