# Making your custom icons themable

> [!NOTE]
> If you're an iconpack maker looking to theme the custom icons used by my plugins, go to [Themeable custom icons](./ICONS.md)

## Prerequisities

- a plugin

## Tutorial

Let's say you're making a plugin and want to use an icon of a inbox. Since the Discord mobile app doesn't have one, you use a custom icon like this:

| Example Inbox Icon             |
| ------------------------------ |
| ![Inbox Icon](./InboxIcon.png) |

```jsx
<Image
	source={{
		uri: "data:image/png;base64,...",
	}}
/>;
```

> [!TIP]
> Most redesigned Discord icons use #EFEFF1 as their tint color

This works, but the icon can't be themed using an iconpack. To do that, you must add `width`, `height` and `path` properties to your icon object, like this:

```jsx
<Image
	source={{
		uri: "data:image/png;base64,...",
		width: 72,
		height: 72,
		path: "YourAwesomePlugin/InboxIcon.png",
	}}
/>;
```

> [!TIP]
> You should follow Discord's icon naming scheme, PascalCase description of object ending with Icon (InboxIcon)

Lastly, set `allowIconTheming` to `true`, like so:

```jsx
<Image
	source={{
		uri: "data:image/png;base64,...",
		width: 72,
		height: 72,
		path: "YourAwesomePlugin/InboxIcon.png",
		allowIconTheming: true,
	}}
/>;
```

And you're done! Iconpack makers can now change the icon by editing the file at `<iconpack root>/_/external/YourAwesomePlugin/InboxIcon.png`.
