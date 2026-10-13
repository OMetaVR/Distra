import { Component, type ReactNode } from "react";
import { ScrollView } from "react-native";

import { errorToString } from "@/lib/utils";
import { Button, Stack, Text } from "@/ui/components";

interface Props {
    children?: ReactNode;
}

interface State {
    error: unknown;
}

/** Keeps a crashing Discordia (or plugin) page from taking down Discord's navigator. */
export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: unknown): State {
        return { error };
    }

    render() {
        if (!this.state.error) return this.props.children;

        return (
            <ScrollView contentContainerStyle={{ padding: 16 }}>
                <Stack spacing={12}>
                    <Text variant="heading-lg/bold">Something went wrong</Text>
                    <Text variant="text-sm/medium" color="text-muted">
                        This page crashed. The error below was also written to the log.
                    </Text>
                    <Text variant="code" style={{ fontFamily: "Menlo" }}>{errorToString(this.state.error)}</Text>
                    <Button text="Retry" onPress={() => this.setState({ error: null })} />
                </Stack>
            </ScrollView>
        );
    }
}
