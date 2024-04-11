# Including Resources

Throughout the documentation you will notice that many of the endpoints include a  `relationships` object inside of the `data` attribute.

For example, if you are the relationships will include `shipment`, and possibly `pod_terminal` and `transport_events`.  You can see the list of possible relationships in the dropdown beside 'included' in our API endpoint documentation ([documentation for container endpoint here](https://developers.terminal49.com/docs/api/docs/reference/terminal49/terminal49.v1.json/paths/~1containers~1%7Bid%7D/get)).

![Screenshot 2024-04-11 at 10.47.23 AM.png](<../../assets/images/Screenshot 2024-04-11 at 10.47.23 AM.png>)


If you want to load the `shipment` and `pod_terminal` without making any additional requests you can add the query parameter `include` and provide a comma delimited list of the related resources:

```
containers/{id}?include=shipment,pod_terminal
```

You can even traverse the relationships up or down. For example if you wanted to know the port of lading for the container you could get that with:

```
containers/{id}?include=shipment,shipment.port_of_lading
```

You can find the set of available relationships through our endpoint documentation as well.

![Screenshot 2024-04-11 at 10.50.11 AM.png](<../../assets/images/Screenshot 2024-04-11 at 10.50.11 AM.png>)
