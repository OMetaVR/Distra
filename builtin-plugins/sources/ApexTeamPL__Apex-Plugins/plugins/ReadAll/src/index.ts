import { after } from "@vendetta/patcher";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import ReadButton, { longPressReadAll, pressReadAll } from "./ReadButton";
import Settings from "./Settings";

const { View } = RN;

const TAG = "[ReadAll+]";
const TILE = 48;
const MARGIN = 4;

let unpatchers: (() => boolean)[] = [];
const patchedObjects = new WeakSet<object>();
let retryTimer: ReturnType<typeof setInterval> | undefined;

function isUseGuildsBarProps(exports: any): boolean {
  return (
    typeof exports?.default === "function" &&
    exports.default.name === "useGuildsBarProps"
  );
}

function patchFooter(ret: any) {
  const ldp = ret?.listDataProps;
  if (!ldp || patchedObjects.has(ldp)) return;
  if (typeof ldp.footerSize !== "function" || typeof ldp.renderFooter !== "function") return;

  const origFooterSize = ldp.footerSize;
  const origRenderFooter = ldp.renderFooter;
  const extra = TILE + 2 * MARGIN;

  ldp.footerSize = () => origFooterSize.call(ldp) + extra;
  ldp.renderFooter = () =>
    React.createElement(
      View,
      { style: { alignSelf: "stretch" }, collapsable: false },
      origRenderFooter.call(ldp),
      React.createElement(ReadButton)
    );

  patchedObjects.add(ldp);
}

const GUILDS_BAR_PROPS = "modules/guilds_bar/native/hooks/useGuildsBarProps.tsx";
// Distra: Discord 348's server rail has no list footer props any more; its bottom buttons
// (create/join, discovery) sit in GuildsBarFooterWrapper, so the button joins them there.
const GUILDS_BAR_FOOTER = "modules/guilds_bar/native/GuildsBarFooterWrapper.tsx";

function patchFooterWrapper(): boolean {
  const footer = (window as any).distra?.metro?.findByFilePath?.(GUILDS_BAR_FOOTER);
  if (!footer || typeof footer.default !== "function" || patchedObjects.has(footer)) return !!footer && patchedObjects.has(footer);
  patchedObjects.add(footer);
  unpatchers.push(after("default", footer, (_args: any[], ret: any) => {
    if (!ret?.props) return ret;
    const children = ret.props.children;
    ret.props.children = [...(Array.isArray(children) ? children : [children]), React.createElement(ReadButton, { key: "read-all" })];
    return ret;
  }));
  return true;
}

// Distra: the button goes at the top of the server rail, as a list header above the DMs button.
const HEADER_SIZE = TILE + 18 + 2 * MARGIN;

function patchHeader(ret: any) {
  const ldp = ret?.listDataProps;
  if (!ldp || patchedObjects.has(ldp)) return;
  patchedObjects.add(ldp);
  // The rail's FastList takes its list header as `headerSize` + `renderHeader`.
  const originalRender = ldp.renderHeader;
  const originalSize = ldp.headerSize;
  ldp.headerSize = typeof originalSize === "function"
    ? (...args: any[]) => originalSize.apply(ldp, args) + HEADER_SIZE
    : (typeof originalSize === "number" ? originalSize : 0) + HEADER_SIZE;
  ldp.renderHeader = (...args: any[]) => React.createElement(
    View,
    { style: { alignSelf: "stretch" }, collapsable: false },
    React.createElement(ReadButton),
    typeof originalRender === "function" ? originalRender.apply(ldp, args) : null,
  );
}

function patchRailHeader(): boolean {
  const hook = (window as any).distra?.metro?.findByFilePath?.(GUILDS_BAR_PROPS);
  if (!hook || typeof hook.default !== "function") return false;
  if (patchedObjects.has(hook)) return true;
  patchedObjects.add(hook);
  unpatchers.push(after("default", hook, (_args: any[], ret: any) => patchHeader(ret)));
  return true;
}

function scanRegistry(): number {
  if (patchRailHeader()) return 1;
  // Distra: function names are stripped in Discord's iOS bundle, so find the hook by its source path.
  const found = (window as any).distra?.metro?.findByFilePath?.(GUILDS_BAR_PROPS);
  if (found && typeof found.default === "function") {
    if (patchedObjects.has(found)) return 1;
    patchedObjects.add(found);
    unpatchers.push(after("default", found, (_args: any[], ret: any) => patchFooter(ret)));
    return 1;
  }

  const modules = (globalThis as any)?.modules;
  if (!modules) return 0;

  let patchedCount = 0;
  for (const id in modules) {
    const def = modules[id];
    if (!def?.isInitialized) continue;
    const exports = def.publicModule?.exports;
    if (!exports) continue;

    if (isUseGuildsBarProps(exports)) {
      try {
        unpatchers.push(
          after("default", exports, (_args: any[], ret: any) => patchFooter(ret))
        );
        patchedCount++;
      } catch (e) {
        console.log(TAG, `Failed to patch module ${id}:`, e);
      }
    }
  }
  return patchedCount;
}

export default {
  onLoad() {
    // Distra: other plugins (Server Drawer) show their own Read All button through this.
    (globalThis as any).__readAllPress = pressReadAll;
    (globalThis as any).__readAllLongPress = longPressReadAll;
    const count = scanRegistry();
    if (count === 0) {
      let ticks = 0;
      retryTimer = setInterval(() => {
        ticks++;
        const n = scanRegistry();
        if (n > 0 || ticks >= 30) {
          if (retryTimer) clearInterval(retryTimer);
          retryTimer = undefined;
        }
      }, 1000);
    }
  },

  onUnload() {
    delete (globalThis as any).__readAllPress;
    delete (globalThis as any).__readAllLongPress;
    if (retryTimer) clearInterval(retryTimer);
    retryTimer = undefined;
    unpatchers.forEach((u) => u());
    unpatchers = [];
  },

  settings: Settings
};