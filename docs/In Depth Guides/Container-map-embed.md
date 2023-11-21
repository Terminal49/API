---
stoplight-id: leasnylhe5su7
tags: [map, embed]
---

# Container Map Embed Guide

The Terminal49 Container Map allows you to embed real-time visualized container tracking on your website with just a few lines of code.

### Prerequisites

- Visit [getting started](https://developers.terminal49.com/docs/api/43898cdb7bad1-1-start-here#get-an-api-key) to get your developer API key and Terminal49 account.
- Familiarity with Shipment and Container APIs.
In the following examples we'll be passing a `containerId` and `shipmentId` variables to the embedded map.
They relate to `id` attributes of the container and shipment objects that are returned by the API.
See [Containers API](https://developers.terminal49.com/docs/api/f77d723c227c1-list-containers) and [Shipments API](https://developers.terminal49.com/docs/api/d31aeeda6fa44-list-shipments) for more information.

### How do I embed the map on my website?

Once you have the API Key, you can embed the map on your website.


1. Copy and paste the code below and insert it on yor website.
This will load and make the map code available through the global `window` object. 

```html
<link rel="stylesheet" href="https://map.terminal49.com/bundle.css" />
<script defer src="https://map.terminal49.com/bundle.js"></script>
```

2. Define a container where you want the map to be displayed. 

```html
<div id="map"></div>
```

3. After the code is loaded, you can use the `window.TntMap` class to create a map instance. 

```javascript
const map = new window.TntMap("#map", {
  authToken: developerApiKey
});
```

Notice that the `authToken` option is required. This is where you pass your developer API key. 

4. Start the map. 
This tells the map to initialize and hook into the element designated during initialization.

```javascript
await map.start();
```

5. Load a container. 
This is the final step where you can pass shipment and container ids to the map where it'll fetch the data and display it on the map.
The reason why this is an another step is because you might re-use that map to load different containers or shipments.

```javascript
await map.load(shipmentId, containerId)
```

Putting it all together, here is the javascript code that you need to embed the map on your website. 

```javascript
const map = new window.TntMap("#map", {
  authToken: developerApiKey
});

await map.start();

await map.load(shipmentId, containerId)
```

![container-map.png](../../assets/images/map/container-map.png)

Additionally, the map element doesn't have to be an element id but can be a DOM element reference instead.
Consider this example where we use a query selector to select the map element.

```javascript
const element = document.querySelector("#map");
const map = new window.TntMap(element, {
  authToken: developerApiKey,
});
```

### Styling the map

All of the map styles are written as human-readable CSS classes and variables.
You can used those to customize the map to your liking.
The styles are written in [BEM](https://getbem.com/) style as well as they're scoped under a `.tntm` class to avoid style conflicts with your website.

#### Sizing

By default the map will take the full width of it's container and take some height.
The map is also expandable by clicking on the expand button on the bottom left corner of the map.
That still might not be enough for your use case, so let's see how you can override the default styles to customize the map to your likings.

Let's say you want to tell the map to take 60% of the total viewport size when expanded, we'd do this as follows:

```css
.tntm .tntm__container.--expanded {
  height: 60vh;
}
```

![container-map-expanded.png](../../assets/images/map/container-map-expanded.png)

#### Colors

We expose a number of CSS variables that you can use to customize the map colors.
All of the variables are bound to the `.tntm` class to avoid style conflicts with your website.
```css
.tntm {
  --marker-background-color: var(--athens-gray-500);
  --marker-border-color: var(--athens-gray-500);
  --marker-text-color: var(--white);
  --marker-secondary-background-color: var(--athens-gray-100);
  --marker-secondary-text-color: var(--athens-gray-500);
}
```

By default their values are set to the Terminal49 brand colors, which we don't recommend changing and only focus on the `--marker` variants instead.
Additionally the variables might require adjusting for different states of the map markers.

What does that mean?
Let's say we want to display markers 'visited' by a vessel as orange and the others - that we call are in 'on-the-way' state as blue.

First let's define the default, blue color:

```css
.tntm [data-journey-state='on-the-way'] {
  --marker-background-color: blue;
  --marker-border-color: lightblue;
  --marker-text-color: var(--white);
  --marker-secondary-background-color: lightblue;
  --marker-secondary-text-color: black;
}

.tntm [data-journey-state='visited'] {
  --marker-background-color: orange;
  --marker-border-color: #FFD580;
  --marker-text-color: var(--white);
  --marker-secondary-background-color: #FFD580;
  --marker-secondary-text-color: black;
}
```

Result:

![container-map-colors.png](../../assets/images/map/container-map-colors.png)

It's also possible to change the marker colors based on wheter they're hovered over or not.

This is what we do on the Terminal49 website to style the map markers to our needs:

```css
[data-journey-state='visited'] {
  --marker-background-color: var(--green-600);
  --marker-border-color: var(--green-600);
  --marker-text-color: var(--white);
  --marker-secondary-background-color: var(--green-50);
  --marker-secondary-text-color: var(--green-600);
}

[data-journey-state='on-the-way'] {
  --marker-background-color: var(--athens-gray-500);
  --marker-border-color: var(--athens-gray-500);
  --marker-text-color: var(--white);
  --marker-secondary-background-color: var(--athens-gray-100);
  --marker-secondary-text-color: var(--athens-gray-500);
}

[data-hovered][data-journey-state='visited'],
[data-hovered] [data-journey-state='visited'] {
  --marker-secondary-background-color: var(--green-200);
  --marker-secondary-text-color: var(--green-700);
  --marker-border-color: var(--green-700);
}

[data-hovered][data-journey-state='on-the-way'],
[data-hovered] [data-journey-state='on-the-way'] {
  --marker-secondary-background-color: var(--athens-gray-200);
  --marker-secondary-text-color: var(--athens-gray-600);
  --marker-border-color: var(--athens-gray-600);
}
```
You might want to copy this code and adjust it to your needs.
