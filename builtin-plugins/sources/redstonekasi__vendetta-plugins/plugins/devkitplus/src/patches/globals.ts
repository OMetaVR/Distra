import { patcher, metro, utils, debug } from "@vendetta";
import { common } from "@vendetta/metro";
import { findByKeyword, findByKeywordAll } from "./window";

const patch = () => {
  const apply = {
    ...patcher,
    ...metro,
    ...common,
    ...utils,
    ...debug,
    findByKeyword,
    findByKeywordAll,
  };

  delete apply["React"];
  // Distra: leave globals that already exist (ReactNative, ...) alone, so unloading doesn't delete them.
  for (const key of Object.keys(apply)) if (key in window) delete apply[key];

  Object.assign(window, apply);

  return () => Object.keys(apply).forEach((k) => delete window[k]);
}

let unpatch;

export default (on = true) => {
  unpatch?.();
  if (on) unpatch = patch();
}
