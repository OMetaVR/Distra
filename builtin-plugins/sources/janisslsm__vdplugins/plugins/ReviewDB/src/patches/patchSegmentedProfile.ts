import { findInReactTree } from "@vendetta/utils";
import ReviewSection from "../components/ReviewSection";
import { after } from "@vendetta/patcher";
import { React } from "@vendetta/metro/common";
import { findProfileSections, isAboutMeCard } from "../lib/utils";

const SegmentedControlPages = bunny.metro.findByFilePath(
	"design/components/SegmentedControl/native/SegmentedControlPages.native.tsx",
);

export default () =>
	typeof SegmentedControlPages?.SegmentedControlPages === "function"
		? after("SegmentedControlPages", SegmentedControlPages, (args, ret) => {
				const profileSections = findProfileSections(
					ret?.props?.children?.[0]?.props?.item?.page?.props?.children ?? ret,
					findInReactTree,
				);
				const userId = profileSections?.find(isAboutMeCard)?.props?.userId
					?? profileSections?.[profileSections.length - 1]?.props?.userId;
				if (!profileSections || !userId || profileSections.some((c: any) => c?.type === ReviewSection)) return;

				profileSections?.push(
					React.createElement(ReviewSection, { userId }),
				);
			})
		: (): boolean => {
				return false;
			};
