import { React } from "@vendetta/metro/common";
import { findByTypeName } from "@vendetta/metro";
import { after } from "@vendetta/patcher";
import { findInReactTree } from "@vendetta/utils";
import ReviewSection from "../components/ReviewSection";
import { findProfileSections } from "../lib/utils";

const SimplifiedUserProfileContent = findByTypeName("SimplifiedUserProfileContent");


export default () => SimplifiedUserProfileContent?.type ? after("type", SimplifiedUserProfileContent, (args, ret) => {
  const profileSections = findProfileSections(ret, findInReactTree);

  const userId = args[0]?.user?.id;
  profileSections?.push(React.createElement(ReviewSection, { userId }));
}) : () => { }