import type { Command } from "enmity/api/commands";
import { registerPlugin, type Plugin } from "enmity/managers/plugins";
import { create, type Patcher } from "enmity/patcher";
import { SettingsPanel } from "./settings-panel";
import { manifest } from "./info";
import { settings } from "./settings";
import { SettingsStore } from "enmity/api/settings";

export { manifest, LibManifest } from "./info";

export * as assets from "./assets";
export * from "./settings";

export interface LibPlugin {
  commands?: Command[];
  patches?: Patcher[];
  SettingsPanel?: React.ComponentType<{ settings: SettingsStore }>;
  onStart?(): void;
  onStop?(): void;
  onLoad?(): void;
  // onEnable?(): void;
  // onDisable?(): void;
}
export const patcher = create(manifest.name);

let hasImplemented = false;
export function implementPlugin(plugin: LibPlugin | (() => LibPlugin)) {
  if (hasImplemented) {
    throw new Error("Plugin has already been implemented!");
  }
  
  hasImplemented = true;

  if (typeof plugin === "function") plugin = plugin();

  const invoke = (name: "onStart" | "onStop" | "onLoad") => {
    if (typeof plugin[name] === "function") plugin[name]();
  }

  if (!manifest.color || manifest.color === "random") {
    manifest.color = `#${Math.floor(Math.random() * (0xFFFFFF + 1)).toString(16)}`;
  }

  const $plugin: Plugin = {
    ...manifest,
    commands: plugin.commands,
    patches: plugin.patches,
    onStart: invoke.bind(null, "onStart"),
    onStop() {
      invoke("onStop");
      patcher.unpatchAll();
    },
    getSettingsPanel: undefined
  }

  const SettingsPage: React.ComponentType<{ settings: SettingsStore }> = plugin.SettingsPanel ??= () => null;
  
  // @ts-expect-error one of many incorrect types
  $plugin.getSettingsPanel = () => (
    <SettingsPanel settings={settings}>
      <SettingsPage settings={settings} />
    </SettingsPanel>
  );

  registerPlugin($plugin);

  // @ts-expect-error
  $plugin["$$_doggy_$$"] = {
    manifest, settings, patcher
  }

  invoke("onLoad");
}
