type SettingsTile = {
    key: string;
	title: () => string;
	icon?: number;
	predicate?: () => boolean;
	trailing?: () => React.ReactNode;
	page: React.ComponentType;
}