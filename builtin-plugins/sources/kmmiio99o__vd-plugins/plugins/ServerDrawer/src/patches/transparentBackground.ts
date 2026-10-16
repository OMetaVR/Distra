import { registerPropsTransform, registerPropsIntercept } from "./createElementIntercept";

const TAG = "[ServerDrawer]";

// The quest dock's outer wrapper carries an opaque card background (borderRadius: 24) via
// useAnimatedStyle - no component reference to intercept, so match on the computed style instead.
// The color itself varies in format (rgba vs hex), so borderRadius + "has a background color" is
// the stable signal, not the color string.
// Distra: this runs for every element Discord creates, so it reads the style without building
// merged copies (later entries win, as when React Native flattens a style).
interface CardProbe { borderRadius?: unknown; backgroundColor?: unknown; position?: unknown; left?: unknown; zIndex?: unknown }
function readStyle(style: any, into: CardProbe, depth: number) {
    if (!style || typeof style !== "object" || depth > 2) return;
    if (Array.isArray(style)) {
        for (let i = 0; i < style.length; i++) readStyle(style[i], into, depth + 1);
        return;
    }
    if ("borderRadius" in style) into.borderRadius = style.borderRadius;
    if ("backgroundColor" in style) into.backgroundColor = style.backgroundColor;
    if ("position" in style) into.position = style.position;
    if ("left" in style) into.left = style.left;
    if ("zIndex" in style) into.zIndex = style.zIndex;
}

const probe: CardProbe = {};
function isQuestDockCard(props: any): boolean {
    const root = props?.style;
    if (!root || typeof root !== "object") return false;

    const styles = Array.isArray(root) ? root : [root];
    for (let i = 0; i < styles.length; i++) {
        const entry = styles[i];
        if (!entry || typeof entry !== "object") continue;
        probe.borderRadius = probe.backgroundColor = probe.position = probe.left = probe.zIndex = undefined;
        readStyle(entry, probe, 0);
        if (probe.borderRadius === 24 && typeof probe.backgroundColor === "string" &&
            probe.position === "absolute" && probe.left === "50%" && probe.zIndex === 1) {
            return true;
        }
    }
    return false;
}

// Removing the card color reveals a second layer underneath: the quest's promotional hero photo.
// Matched by URL shape, not component, since the same image component renders ordinary guild/
// folder icons everywhere else too.
function getSourceUri(props: any): string | undefined {
    const source = props?.source;
    if (!source) return undefined;
    if (Array.isArray(source)) return source[0]?.uri;
    return source.uri;
}

function isQuestHeroImage(props: any): boolean {
    const uri = getSourceUri(props);
    return typeof uri === "string" && uri.includes("/quests/");
}

export function patchTransparentBackground(): boolean {
    registerPropsTransform(
        (props: any) => isQuestDockCard(props),
        (props: any) => ({
            ...props,
            style: [props?.style, { backgroundColor: "transparent" }],
        }),
    );
    registerPropsIntercept(isQuestHeroImage, null);
    console.log(TAG, "PATCH: watching for the quest dock card background and hero image");
    return true;
}
