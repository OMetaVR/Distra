import { findByProps, findByStoreName } from "@vendetta/metro";
import { React } from "@vendetta/metro/common";

import Text from "./Text";

const { showUserProfile } = findByProps("showUserProfile");
const { fetchProfile } = findByProps("fetchProfile");

const UserStore = findByStoreName("UserStore");

export default function SmartMention({
	userId,
	color,
	loadUsername,
	children,
}: React.PropsWithChildren<{
	userId: string;
	color?: string;
	loadUsername?: boolean;
}>) {
	const [loadedUsername, setLoadedUsername] = React.useState<null | string>(
		null,
	);

	React.useEffect(() => {
		// The effect must not return anything: its Promise was used as the cleanup function, and React threw
		// "Object is not a function" when the mention unmounted (it crashed the app in NexxUtils credits).
		if (loadedUsername || !loadUsername) return;

		const cached = UserStore.getUser(userId);
		if (cached) setLoadedUsername(cached.username);
		else {
			fetchProfile(userId).then(x => {
				setLoadedUsername(x.user.username);
			}).catch(() => {});
		}
	}, [loadUsername]);

	return (
		<Text
			variant="text-md/bold"
			color={color ?? "TEXT_DEFAULT"}
			onPress={() =>
				UserStore.getUser(userId)
					? showUserProfile({ userId })
					: fetchProfile(userId).then(() => showUserProfile({ userId }))}
		>
			{loadUsername ? `@${loadedUsername ?? "..."}` : children}
		</Text>
	);
}
