// A chat row's header timestamp is one string in the row data (`row.message.timestamp`). Plugins that
// change it go through here so their RowManager#generate patches compose in any order: Custom
// Timestamps replaces the time, Timezones appends the author's local time after it.

const suffixes = new WeakMap<object, string[]>();

/** Replaces the timestamp text, keeping whatever other plugins appended. */
export function setRowTimestamp(rowMessage: any, text: string) {
    rowMessage.timestamp = text + (suffixes.get(rowMessage)?.join("") ?? "");
}

/** Appends `suffix` to the timestamp text. */
export function appendRowTimestamp(rowMessage: any, suffix: string) {
    if (!suffix) return;
    rowMessage.timestamp = `${rowMessage.timestamp ?? ""}${suffix}`;
    const list = suffixes.get(rowMessage);
    if (list) list.push(suffix);
    else suffixes.set(rowMessage, [suffix]);
}
