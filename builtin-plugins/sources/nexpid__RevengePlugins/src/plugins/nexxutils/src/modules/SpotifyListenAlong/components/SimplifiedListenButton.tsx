import { React, ReactNative as RN } from "@vendetta/metro/common";

import { IconButton } from "$/lib/redesign";

import UserPlayIcon from "../../../../assets/SpotifyListenAlong/UserPlayIcon.png";
import { doSync, type ListenButtonProps, useListenButton, useLoading } from "./core";

/** If the listen button ever fails to render, show Discord's own button instead of taking the profile down */
class Fallback extends React.Component<
	React.PropsWithChildren<{ fallback: React.ReactNode }>,
	{ failed: boolean }
> {
	state = { failed: false };

	static getDerivedStateFromError() {
		return { failed: true };
	}

	componentDidCatch(error: unknown) {
		console.warn("[NexxUtils] Add Listen Along button failed to render:", error);
	}

	render() {
		return this.state.failed ? this.props.fallback : this.props.children;
	}
}

function ListenButton({
	button,
	activity,
}: ListenButtonProps) {
	const { disabled, userId } = useListenButton(activity);
	const { loading: _loading, trigger } = useLoading();
	const loading = _loading && !disabled;

	return (
		<RN.View style={{ flexDirection: "row", flex: 1, gap: 6 }}>
			<IconButton
				size="md"
				variant="secondary"
				style={[!!disabled && { opacity: 0.5 }]}
				loading={loading}
				icon={UserPlayIcon}
				onPress={() => (
					doSync(disabled, activity, userId), !disabled && trigger()
				)}
			/>
			<RN.View style={{ flexGrow: 1 }}>{button}</RN.View>
		</RN.View>
	);
}

export default function SimplifiedListenButton(props: ListenButtonProps) {
	return (
		<Fallback fallback={props.button}>
			<ListenButton {...props} />
		</Fallback>
	);
}
