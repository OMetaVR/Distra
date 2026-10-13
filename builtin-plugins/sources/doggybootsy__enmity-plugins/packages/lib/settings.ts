import { makeStore } from "enmity/api/settings";
import { manifest } from "./info";

export const settings = makeStore(manifest.name);