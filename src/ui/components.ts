// Discord's design-system components. Using them (rather than our own) keeps
// Discordia's pages visually native and theme-aware.

import { lazyDestructure } from "@/lib/lazy";
import { findByProps, findByPropsLazy } from "@/metro";
import { findProp, findSingular } from "@/metro/common";

type C<P = any> = React.ComponentType<P>;

// Tables (the settings list primitives used throughout the redesigned app)
export const TableRow = findProp("TableRow") as C & { Icon: C; Arrow: C };
export const TableRowIcon = findProp("TableRowIcon") as C;
export const TableRowGroup = findProp("TableRowGroup") as C<{ title?: string; children?: React.ReactNode }>;
export const TableSwitchRow = findProp("TableSwitchRow") as C;
export const TableRadioGroup = findProp("TableRadioGroup") as C;
export const TableRadioRow = findProp("TableRadioRow") as C;
export const TableRowTrailingText = findProp("TableRowTrailingText") as C<{ text: string }>;

// Layout & text
export const Stack = findProp("Stack") as C<{ spacing?: number; direction?: "vertical" | "horizontal"; style?: any; children?: React.ReactNode }>;
export const Text = findProp("Text", "LegacyText") as C<{ variant?: string; color?: string; style?: any; children?: React.ReactNode }>;
export const Card = findProp("Card") as C;

// Inputs
export const Button = findSingular("Button") as C;
export const TextInput = findSingular("TextInput") as C;

// Sheets & alerts
export const ActionSheet = findProp("ActionSheet") as C;
export const AlertModal = findProp("AlertModal") as C;
export const AlertActionButton = findProp("AlertActionButton") as C;

export const { SafeAreaView, useSafeAreaInsets } = lazyDestructure(() => findByProps("useSafeAreaInsets"));

/** Legacy `Forms` components, still used by many Vendetta-era plugins. */
export const Forms = findByPropsLazy("Form", "FormSection");
