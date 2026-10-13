import { findByStoreName, find, findByProps, findByName } from "@vendetta/metro";
import { semanticColors } from "@vendetta/ui";
import { APIResponse, Review } from "../def";
import { admins } from "..";

const { getCurrentUser } = findByStoreName("UserStore");
const resolveSemanticColor: (theme: Theme, semanticColor: object) => string =
	find((m) => m.default?.internal?.resolveSemanticColor)?.default.internal
		.resolveSemanticColor ??
	find((m) => m.meta?.resolveSemanticColor)?.meta.resolveSemanticColor ??
	(() => {});
const { useThemeContext } = findByProps("useThemeContext");

export const canDeleteReview = (review: Review, owner: string) =>
	review.sender.discordID === getCurrentUser()?.id ||
	admins.includes(getCurrentUser()?.id) || owner === getCurrentUser()?.id;

export async function jsonFetch<T = APIResponse>(
	input: RequestInfo | URL,
	options?: RequestInit,
): Promise<T> {
	const req = await fetch(input, {
		headers: {
			"content-type": "application/json",
			accept: "application/json",
		},
		...options,
	});

	const json = await req.json();
	if (json.success === false) throw new Error(json.message);

	return json;
}

const semanticColorAlternatives = {
	TEXT_NORMAL: "TEXT_DEFAULT",
};

// I think Discord have a hook like this but it confused me to no end, so I made my own!
export const useThemedColor = (key: string) => {
	if (!semanticColors[key] && semanticColorAlternatives[key])
		key = semanticColorAlternatives[key];

	return (
		(semanticColors[key] &&
			resolveSemanticColor(
				useThemeContext()?.theme ?? "dark",
				semanticColors[key],
			)) ||
		"#000000"
	);
};

// Discord 2xx+ minifies component names, so the about-me card is matched by identity too
// (read at call time: other plugins may have patched its export).
const AboutMeCardModule = findByName("UserProfileAboutMeCard", false);
const ABOUT_NAMES = ["UserProfileBio", "UserProfileAboutMeCard", "SimplifiedUserProfileAboutMeCard"];

export function isAboutMeCard(element: any): boolean {
	const type = element?.type;
	if (type == null) return false;
	const card = AboutMeCardModule?.default;
	return (card != null && (type === card || type.type === card)) || ABOUT_NAMES.includes(type.name);
}

/** The children array of the element that lists a profile's sections (the one holding the about-me card). */
export function findProfileSections(tree: any, findInReactTree: (tree: any, filter: (node: any) => boolean) => any): any[] | undefined {
	return findInReactTree(tree, (r) => Array.isArray(r?.props?.children) && r.props.children.some(isAboutMeCard))?.props?.children;
}
