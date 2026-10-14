import { findByProps } from "@vendetta/metro";
import { React } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { getAssetIDByName } from "@vendetta/ui/assets";
import dark from "./dark.png";
import light from "./light.png";

import { Module, ModuleCategory } from "../../stuff/Module";
import ClassicListenButton from "./components/ClassicListenButton";
import SimplifiedListenButton from "./components/SimplifiedListenButton";

const { SpotifyPlayButton } = findByProps("SpotifyPlayButton") ?? {};
const PlayOnSpotifyButton = findByProps("PlayOnSpotifyButton");

export default new Module({
	id: "spotify-listen-along",
	label: "Add Listen Along",
	meta: {
		sublabel: "Ports the Spotify listen along feature from desktop to mobile in Spotify activities",
		category: ModuleCategory.Useful,
		icon: getAssetIDByName("MusicIcon"),
		thumbnail: {
			dark,
			light,
		},
		extra: {
			credits: ["1001086404203389018"],
		},
	},
	handlers: {
		onStart() {
			// Discord 348 renders its "Play on Spotify" button for activities from PlayOnSpotifyButton (profile
			// activity card), a function component. SpotifyPlayButton still exists in the module but nothing renders
			// it anymore (and it was a class with a render method on older versions, which this used to patch).
			if (typeof SpotifyPlayButton?.prototype?.render === "function") {
				this.patches.add(
					after(
						"render",
						SpotifyPlayButton.prototype,
						(
							_,
							{
								props: button,
								_owner: {
									stateNode: {
										props: { activity },
									},
								},
							},
						) =>
							React.createElement(ClassicListenButton, {
								button,
								activity,
							}),
					),
				);
			} else {
				console.warn(
					"[NexxUtils] Add Listen Along: SpotifyPlayButton is not a class component on this Discord version; skipping that patch",
				);
			}

			if (typeof PlayOnSpotifyButton?.PlayOnSpotifyButton !== "function") {
				console.warn(
					"[NexxUtils] Add Listen Along: PlayOnSpotifyButton not found on this Discord version; nothing to patch",
				);
				return;
			}
			this.patches.add(
				after(
					"PlayOnSpotifyButton",
					PlayOnSpotifyButton,
					([props], button) => {
						const activity = props?.activity;
						// Only Spotify activities that are a listen along party can be joined
						if (typeof activity?.party?.id !== "string" || !activity.party.id.includes(":")) return;
						return React.createElement(SimplifiedListenButton, {
							button,
							activity,
						});
					},
				),
			);
		},
		onStop() {},
	},
});
