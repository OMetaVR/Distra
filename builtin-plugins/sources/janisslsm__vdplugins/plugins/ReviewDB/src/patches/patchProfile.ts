import { React } from "@vendetta/metro/common";
import { findByTypeName } from "@vendetta/metro";
import { after } from "@vendetta/patcher";
import { findInReactTree } from "@vendetta/utils";
import ReviewSection from "../components/ReviewSection";
import { findProfileSections } from "../lib/utils";

let UserProfile = findByTypeName("UserProfile");
// Discord 2xx+ renders profile sections in tabs; patchSegmentedProfile handles those.
if(UserProfile === undefined)
    UserProfile = findByTypeName("UserProfileContent");

export default () => UserProfile?.type ? after("type", UserProfile, (args, ret) => {
    const profileSections = findProfileSections(ret, findInReactTree);

    let userId = args[0]?.userId;
    if (userId === undefined)
        userId = args[0]?.user?.id;

    profileSections?.push(React.createElement(ReviewSection, { userId }));
}) : () => { };
