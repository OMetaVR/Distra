import { ReactNative, clipboard, React } from "@vendetta/metro/common"
import { showToast } from "@vendetta/ui/toasts"
import { getAssetIDByName } from "@vendetta/ui/assets"
import { Codeblock, Button } from "@vendetta/ui/components"
import { cleanMessage } from "./cleanMessage"

const { ScrollView } = ReactNative

export default function RawPage({ message }) {
    // Process message through cleanMessage
    const processedMessage = React.useMemo(() => {
        if (!message) {
            console.warn("[ViewRaw] No message provided")
            return null
        }
        return cleanMessage(message)
    }, [message?.id, message])

    const stringMessage = React.useMemo(() => {
        if (!processedMessage) {
            return "Error: No message data available"
        }
        try {
            return JSON.stringify(processedMessage, null, 4)
        } catch (e) {
            console.error("[ViewRaw] Failed to stringify message:", e)
            return "Error: Failed to serialize message"
        }
    }, [processedMessage])

    const style = { marginBottom: 8 }

    // If no message, show error
    if (!processedMessage) {
        return (
            <ScrollView style={{ flex: 1, marginHorizontal: 13, marginVertical: 10 }}>
                <Codeblock>Error: No message data available</Codeblock>
            </ScrollView>
        )
    }

    return (
        <ScrollView style={{ flex: 1, marginHorizontal: 13, marginVertical: 10 }}>
            <Button
                style={style}
                text="Copy Raw Content"
                color="brand"
                size="small"
                disabled={!message?.content}
                onPress={() => {
                    if (message?.content) {
                        clipboard.setString(message.content)
                        showToast("Copied content to clipboard", getAssetIDByName("toast_copy_link"))
                    }
                }}
            />
            <Button
                text="Copy Raw Data"
                style={style}
                color="brand"
                size="small"
                onPress={() => {
                    clipboard.setString(stringMessage)
                    showToast("Copied data to clipboard", getAssetIDByName("toast_copy_link"))
                }}
            />
            {message?.content && <Codeblock selectable style={style}>{message.content}</Codeblock>}
            <Codeblock selectable>{stringMessage}</Codeblock>
        </ScrollView>
    )
}