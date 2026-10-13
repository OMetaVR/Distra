/**
 * Half attempt to type the Form components
 */

import { 
  FormSection as $FormSection,
  FormRow as $FormRow,
  FormDivider as $FormDivider,
  FormSwitch as $FormSwitch,
  FormInput as $FormInput
} from "enmity/components";
import type { PressableProps, TextInputProps } from "react-native";

export const FormSection = $FormSection as React.ComponentType<React.PropsWithChildren<{ title: string }>>;

interface FormRowProps extends PressableProps {
  label: React.ReactNode;
  subLabel?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ComponentType | React.ReactNode;
}

interface FormRow extends React.FunctionComponent<FormRowProps> {
  Icon: React.ComponentType<{ source: number }>;
  Arrow: React.ComponentType;
  Label: React.ComponentType;
}
export const FormRow = $FormRow as FormRow;

export const FormDivider = () => __jsx__($FormDivider);

export const FormSwitch = $FormSwitch as React.ComponentType<{
  value: boolean,
  onValueChange(value: boolean): void
}>;

export const FormInput = $FormInput as React.ComponentType<Omit<TextInputProps, "onChange"> & {
  title: React.ReactNode;
  value: string;
  onChange(value: string): void;
}>;