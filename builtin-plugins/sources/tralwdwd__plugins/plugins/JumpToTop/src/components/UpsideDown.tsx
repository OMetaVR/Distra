import { ReactNative as RN } from "@vendetta/metro/common";

export function UpsideDown({ children }: React.PropsWithChildren) {
    return (
        <RN.View
            style={{
                transform: [{ scaleY: -1 }],
            }}
        >
            {children}
        </RN.View>
    );
}
