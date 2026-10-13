// `import ... from "react"` / "react-native" resolve here at build time (see scripts/build.mjs).
// Each export is a lazy proxy onto Discord's own copy found through Metro.
import { findByPropsLazy } from "@/metro";

const deps: Record<string, any> = {
    "react": findByPropsLazy("createElement", "useState"),
    "react-native": findByPropsLazy("AppRegistry", "View"),
};

export default deps;
