import { before, after } from "@vendetta/patcher";
import { findByName } from "@vendetta/metro";
import { findInReactTree } from "@vendetta/utils";
import ListenAlongButton from "./components/ListenAlongButton";

const profileSection = findByName("UserProfileSection", false);
let patches = []

export default {
    onLoad: () => {
        patches.push(before("default", profileSection, ([arg]) => {
            if (arg.title?.toLowerCase().includes("spotify")) {
                const actions = findInReactTree(
                    arg.children,
                    (x) => x?.type?.name === "Actions"
                );

                if (actions) {
                    const { activityButtonColor, activity, user } = actions.props;
                    if (activityButtonColor && activity && user)
                        patches.push(after("type", actions,
                            (_, ret) =>
                            (ret.props.children = [
                                ret.props.children,
                                <ListenAlongButton
                                    background={activityButtonColor}
                                    activity={activity}
                                    user={user}
                                />,
                            ]),
                            true
                        )
                        )
                } else console.log("no actions :(");
            }
        }))
    },
    onUnload: () => {
        for (const p of patches) p();
    }
}