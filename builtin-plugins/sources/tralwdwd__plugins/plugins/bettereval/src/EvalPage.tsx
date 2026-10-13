import { React } from "@vendetta/metro/common";
import { ReactNative as RN } from "@vendetta/metro/common";
import { findByProps } from "@vendetta/metro";
import { Codeblock } from "@vendetta/ui/components";

const util = findByProps("inspect");

const Design = findByProps("Stack", "Button");
const { Stack, Button, TableRowGroup, TableSwitchRow, TextArea } = Design;

export function EvalPage() {
    const [code, setCode] = React.useState("");
    const [awaitResult, setAwaitResult] = React.useState(true);
    const [showHidden, setShowHidden] = React.useState(true);
    const [result, setResult] = React.useState("undefined");

    return (
        <RN.ScrollView contentContainerStyle={{ padding: 16 }}>
            <Stack spacing={16}>
                <TextArea
                    onChange={(v: string) => setCode(v)}
                    placeholder="bunny.metro.findByProps"
                />
                <TableRowGroup>
                    <TableSwitchRow
                        label="Await result"
                        subLabel="Should the result be awaited."
                        value={awaitResult}
                        onValueChange={setAwaitResult}
                    />
                    <TableSwitchRow
                        label="Show hidden"
                        subLabel="Should the result contain hidden properties."
                        value={showHidden}
                        onValueChange={setShowHidden}
                    />
                </TableRowGroup>
                <Button
                    onPress={async function () {
                        try {
                            const res = (0, eval)(
                                `${code}//# sourceURL=BetterEval`,
                            );

                            setResult(
                                util.inspect(awaitResult ? await res : res, {
                                    showHidden,
                                }),
                            );
                        } catch (e) {
                            setResult(util.inspect(e));
                        }
                    }}
                    text="Evaluate"
                />
                <Codeblock>{result}</Codeblock>
            </Stack>
        </RN.ScrollView>
    );
}
