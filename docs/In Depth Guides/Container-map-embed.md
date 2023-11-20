---
stoplight-id: leasnylhe5su7
tags: [map, embed]
---

# Container Map Embed Guide

The Terminal49 Container Map allows you to embed real-time visualized container tracking on your website with just a few lines of code.

### How do I embed the map on my website?

--- Do we have those for the map? ---

> First, you neeed a publishable API KEY. You can get this by reaching out to us at support@terminal49.com 

--- Do we have those for the map? ---

Once you have the key, you can embed the map on your website.


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
  authToken: publishableApiKey,
});
```

Notice that the `authToken` option is required. This is the publishable API key that you can get by reaching out to us at support@terminal49.com.

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
  authToken: publishableApiKey,
});

await map.start();

await map.load(shipmentId, containerId)
```

Additionally, the map element doesn't have to be an element id but can be a DOM element reference instead.
Consider this example where we use a query selector to select the map element.

```javascript
const element = document.querySelector("#map");
const map = new window.TntMap(element, {
  authToken: publishableApiKey,
});
```

### Styling the map

TBD


## Frequently Asked Questions 

### How does it work? 

With a few lines of code, you can embed an interactive container tracking form. Once the widget is live on your website, your customer can enter a master bill of lading, container number, or reference numbers that a shipment is tagged with. After the number has been entered, the widget will retrieve and display shipment and container details from your Terminal49 account.

### Do I need Terminal49 account? 
Yes, the information that fetched and displayed by the widget is based on the shipments and containers tracked within your Terminal49 account. 

### Can my customer track *any* shipment/container? 
No, only the shipments and containers that are tracked in your Terminal49 account. 

### Is there a cost to embed the widget? 
Yes, there is a $500/month fee to embed and use the widget. This include unlimited number of visitors and tracking requests.  


## Terminal49 container tracking widget one-pager

Here is a one-pager that describes the benefits of the Track & Trace Widget. Feel free to share it with your team or management if you want to demonstrate the benefits of adding track and trace functionality to your website.

The Track & Trace Widget provides a number of advantages:

- It offers your customers a convenient way to track their shipments and containers.
- It helps to improve customer satisfaction by providing accurate container status.
- It can reduce customer service costs by providing customers with the information they need without having to contact customer service.
- It can help you differentiate from other service providers. 


![terminal49-container-tracking-widget.jpg](../../assets/images/terminal49-container-tracking-widget.jpg)
