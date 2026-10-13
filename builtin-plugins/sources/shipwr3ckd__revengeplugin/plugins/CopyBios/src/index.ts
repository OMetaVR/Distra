import { findByName } from "@vendetta/metro";
import { ReactNative } from "@vendetta/metro/common";
import { after, unpatchAll } from "@vendetta/patcher";

const BioText = findByName("BioText", false);

function textSelection(node: any): void {
  if (!node || typeof node !== "object") return;

  if (node.type === ReactNative.Text) {
    node.props.selectable = true;

    if (typeof node.props.onPress !== "function") {
      node.props.onPress = () => {};
    }
  }

  const children = node.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      textSelection(child);
    }
  } else if (typeof children === "object") {
    textSelection(children);
  }
}

after("default", BioText, ([props], res) => {
  if (!res?.props) return res;

  res.props.selectable = true;

  if (typeof res.props.onPress !== "function") {
    res.props.onPress = () => {};
  }

  textSelection(res);
  return res;
});

export const onUnload = () => unpatchAll();