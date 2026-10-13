import { findByName, findByTypeName } from "@vendetta/metro";
import { React } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";
import dark from "./dark.png";
import light from "./light.png";

import { Module, ModuleCategory } from "../../stuff/Module";
import InviteButton from "./components/InviteButton";

const MediaKeyboardListHeader = findByTypeName("MediaKeyboardListHeader");
// Discord 2xx+: the attachment sheet's action row (Files, Polls, ...) replaced the list header.
const MediaKeyboardActions = !MediaKeyboardListHeader ? findByName("MediaKeyboardBottomSheetActions", false) : undefined;
const INVITE_KEY = "nexxutils-spotify-invite";

function addToActionRow(ret: any) {
	const row = findInReactTree(ret, (n: any) =>
		Array.isArray(n?.props?.children)
		&& n.props.children.some((c: any) => c?.props?.accessibilityRole === "button"));
	const children = row?.props?.children;
	if (!children || children.some((c: any) => c?.key === INVITE_KEY)) return;
	children.push(React.createElement(InviteButton, { key: INVITE_KEY }));
}

export default new Module({
	id: "send-spotify-invite",
	label: "Send Spotify invite",
	meta: {
		sublabel:
			"Adds a button in the chat attachment menu to invite the channel to listen along to spotify",
		category: ModuleCategory.Useful,
		icon: getAssetIDByName("img_account_sync_spotify_white"),
		thumbnail: {
			dark,
			light,
		},
	},
	handlers: {
		onStart() {
			if (!MediaKeyboardListHeader && MediaKeyboardActions?.default) {
				const actions = MediaKeyboardActions.default;
				this.patches.add(
					typeof actions === "function"
						? after("default", MediaKeyboardActions, (_, ret) => void addToActionRow(ret))
						: after("type", actions, (_, ret) => void addToActionRow(ret)),
				);
				return;
			}
			this.patches.add(
				after("type", MediaKeyboardListHeader, (_, ret) => {
					return {
						...ret,
						props: {
							...ret.props,
							children: [
								...ret.props.children,
								React.createElement(InviteButton, {}),
							],
						},
					};
				}),
			);
		},
		onStop() {},
	},
});
