import { before, after } from "@vendetta/patcher";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { findInReactTree } from "@vendetta/utils";
import { findByName, findByProps } from "@vendetta/metro";
import { React } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import RawPage from "./RawPage";

const LazyActionSheet = findByProps("openLazy", "hideActionSheet");
const Navigation = findByProps("push", "pushLazy", "pop");
const modalCloseButton =
  findByProps("getRenderCloseButton")?.getRenderCloseButton ??
  findByProps("getHeaderCloseButton")?.getHeaderCloseButton;
const Navigator =
  findByName("Navigator") ?? findByProps("Navigator")?.Navigator;
const { FormRow, FormIcon } = Forms;
const { ActionSheetRow } = findByProps("ActionSheetRow");

let viewRawUnpatch: (() => void) | null = null;

export default {
  onLoad() {
    viewRawUnpatch = before("openLazy", LazyActionSheet, ([component, key, msg]) => {
      const message = msg?.message;
      if (key !== "MessageLongPressActionSheet" || !message) return;

      component.then((instance) => {
        const unpatchAfter = after("default", instance, (_, component) => {
          React.useEffect(() => () => { unpatchAfter(); }, []);

          const navigator = () => (
            <Navigator
              initialRouteName="RawPage"
              goBackOnBackPress
              screens={{
                RawPage: {
                  title: "ViewRaw",
                  headerLeft: modalCloseButton?.(() => Navigation.pop()),
                  render: () => <RawPage message={message} />,
                },
              }}
            />
          );

          const viewRawButton = (
            <FormRow
              label="View Raw"
              leading={
                <FormIcon
                  style={{ opacity: 1 }}
                  source={getAssetIDByName("ic_chat_bubble_16px")}
                />
              }
              onPress={() => {
                LazyActionSheet.hideActionSheet();
                Navigation.push(navigator);
              }}
            />
          );

          // Try to find a place to insert the button
          const actionSheetContainer = findInReactTree(
            component,
            (x) => Array.isArray(x) && x[0]?.type?.name === "ActionSheetRowGroup",
          );
          const buttons = findInReactTree(
            component,
            (x) => x?.[0]?.type?.name === "ButtonRow",
          );

          let inserted = false;

          // Case 1: Try ButtonRow
          if (buttons?.push) {
            // Remove existing ViewRaw button if it exists
            const existingIdx = buttons.findIndex((b: any) => b?.props?.label === "View Raw");
            if (existingIdx !== -1) {
              buttons.splice(existingIdx, 1);
            }
            buttons.push(viewRawButton);
            inserted = true;
          }

          // Case 2: Try ActionSheetRowGroup
          if (!inserted && actionSheetContainer?.[1]?.props?.children?.push) {
            const middleGroup = actionSheetContainer[1];
            const children = Array.isArray(middleGroup.props.children) 
              ? middleGroup.props.children 
              : [middleGroup.props.children];
            
            // Remove existing ViewRaw button if it exists
            const existingIdx = children.findIndex((c: any) => c?.props?.label === "View Raw");
            if (existingIdx !== -1) {
              children.splice(existingIdx, 1);
            }

            const firstChild = children[0];
            if (firstChild?.props?.icon) {
              const ActionSheetRowComponent = firstChild.type;
              const viewRawActionSheetButton = (
                <ActionSheetRowComponent
                  label="View Raw"
                  icon={{
                    $$typeof: firstChild.props.icon.$$typeof,
                    type: firstChild.props.icon.type,
                    key: null,
                    ref: null,
                    props: {
                      IconComponent: () => (
                        <FormIcon
                          style={{ opacity: 1 }}
                          source={getAssetIDByName("ic_chat_bubble_32px")}
                        />
                      ),
                    },
                  }}
                  onPress={() => {
                    LazyActionSheet.hideActionSheet();
                    Navigation.push(navigator);
                  }}
                  key="view-raw"
                />
              );
              middleGroup.props.children.push(viewRawActionSheetButton);
              inserted = true;
            }
          }

          // Case 3: Create new group at the end - use ActionSheetRow.Group directly
          if (!inserted && actionSheetContainer?.push) {
            // Use ActionSheetRow.Group instead of trying to find it
            const newGroup = React.createElement(
              ActionSheetRow.Group,
              null,
              viewRawButton
            );
            actionSheetContainer.push(newGroup);
            inserted = true;
          }

          if (!inserted) {
            console.log("[ViewRaw] Could not insert button");
          }
        });
      });
    });
  },

  onUnload() {
    viewRawUnpatch?.();
    viewRawUnpatch = null;
  }
};