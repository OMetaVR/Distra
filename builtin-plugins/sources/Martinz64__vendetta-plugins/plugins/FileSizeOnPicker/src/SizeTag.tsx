//import React, { useState, useEffect } from "react";
import { React, ReactNative } from "@vendetta/metro/common";
import { formatBytes } from "./utils";
import { General } from "@vendetta/ui/components";

const { Text } = General;
let sizeCache = {};

export function SizeTag(props) {
    const [size, setSize] = React.useState("");
    const [loading, setLoading] = React.useState(true);
    const { url } = props;

    const { NativeModules } = ReactNative;

    React.useEffect(() => {
        async function fetchData() {
            if(!sizeCache[url]){
                // Distra: in bridgeless mode Discord's file module may only be reachable through
                // the native module proxy, and a missing module or rejected promise inside this
                // effect used to crash the picker.
                const proxy = (window as any).nativeModuleProxy ?? {};
                const FileManager = proxy.NativeFileModule ?? proxy.RTNFileManager ?? proxy.DCDFileManager
                    ?? NativeModules.NativeFileModule ?? NativeModules.RTNFileManager ?? NativeModules.DCDFileManager
                if (!url || typeof FileManager?.getSize !== "function") {
                    setLoading(false);
                    return;
                }
                Promise.resolve(FileManager.getSize(url)).then(size => {
                    setSize(formatBytes(size));
                    setLoading(false);
                    sizeCache[url] = size;
                }).catch(() => setLoading(false))
            } else {
                setSize(formatBytes(sizeCache[url]));
                setLoading(false);
            }
            
        }
        fetchData();
    }, []);

    if (loading) {
        return <Text style={props.style}>...</Text>;
    }
    if (!size) return null;

    return <Text style={props.style}>{size}</Text>;
}