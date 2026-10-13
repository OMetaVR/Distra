import { findByProps } from "@vendetta/metro";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { jumpToTop } from "../utils";
import { UpsideDown } from "./UpsideDown";

const Design = findByProps("Stack", "Button", "Text");
const { IconButton } = Design;

const commonProps = {
	variant: "secondary",
	icon: getAssetIDByName("ArrowLargeDownIcon"),
};

type OldButtonsProps = {
	isNotCurrentChannel?: boolean;
	details?: { guildId?: string; channelId?: string };
	JumpToPresentButton: React.ReactElement;
	noJumpToPresent?: boolean;
};

export function OldButtons({
	isNotCurrentChannel = false,
	details = {},
	JumpToPresentButton,
	noJumpToPresent = false,
}: OldButtonsProps) {
	const jumpToPresent = JumpToPresentButton.props?.onPress;

	if (noJumpToPresent)
		return <IconButton onPress={jumpToPresent} {...commonProps} />;

	return (
		<>
			<UpsideDown>
				<IconButton
					onPress={jumpToTop(isNotCurrentChannel, details)}
					{...commonProps}
				/>
			</UpsideDown>
			<IconButton onPress={jumpToPresent} {...commonProps} />
		</>
	);
}
