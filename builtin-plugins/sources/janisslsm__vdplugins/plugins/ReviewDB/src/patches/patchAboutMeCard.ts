import { React } from "@vendetta/metro/common";
import { findByName } from "@vendetta/metro";
import { after } from "@vendetta/patcher";
import ReviewSection from "../components/ReviewSection";

// Discord 2xx+: profiles render UserProfileAboutMeCard({ userId, ... }) inside their tabs, so the
// reviews are added right after it. Returns undefined when the card isn't found.
const AboutMeCard = findByName("UserProfileAboutMeCard", false);

export default () => typeof AboutMeCard?.default === "function"
	? after("default", AboutMeCard, ([props], ret) => props?.userId
		? React.createElement(React.Fragment, {}, ret, React.createElement(ReviewSection, { userId: props.userId }))
		: ret)
	: undefined;
