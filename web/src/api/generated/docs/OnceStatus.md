
# OnceStatus


## Properties

Name | Type
------------ | -------------
`canSend` | boolean
`ownDeviceIds` | Array&lt;string&gt;
`ownEnabled` | boolean
`partner` | [AuthorSummary](AuthorSummary.md)
`partnerEnabled` | boolean
`receptionVersion` | number
`recipientDevices` | [Array&lt;OnceDeviceView&gt;](OnceDeviceView.md)

## Example

```typescript
import type { OnceStatus } from ''

// TODO: Update the object below with actual values
const example = {
  "canSend": null,
  "ownDeviceIds": null,
  "ownEnabled": null,
  "partner": null,
  "partnerEnabled": null,
  "receptionVersion": null,
  "recipientDevices": null,
} satisfies OnceStatus

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as OnceStatus
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


