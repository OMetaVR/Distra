import { React, ReactNative } from "@vendetta/metro/common";
const { View, Text, Image, TouchableOpacity, Linking } = ReactNative;

const LINK = "https://youtu.be/_yqSbnbUsj4"

export default () => {
    const openMeowMeow = () => {
        Linking.canOpenURL(LINK).then(canOpen => {
            if (canOpen) Linking.openURL(LINK)
        })
    }

    return (
        <View
            style={{
                width: "100%",
                height: "100%",
                backgroundColor: "white",
                display: "flex",
                justifyContent: "center",
                alignItems: "center"
            }}
        >
            <View
                style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                }}
            >
                <Text
                    style={{
                        fontSize: 30
                    }}
                >Hewwo! ^w^</Text>
                <Text style={{
                    textAlign: "center"
                }}>If you see this, it means the plugin is working! You can keep going with dev!</Text>
            </View>
            <TouchableOpacity
                onPress={openMeowMeow}
            >
                <Image 
                    style={{ width: 300, height: 300 }}
                    source={{
                        uri: "https://i.redd.it/77tagi3s1d7c1.gif"
                    }} 
                />
            </TouchableOpacity>
        </View>
    )
}