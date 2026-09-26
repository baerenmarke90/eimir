
# NotificationPreferenceEntry


## Properties

Name | Type
------------ | -------------
`channels` | [Array&lt;NotificationChannelPreference&gt;](NotificationChannelPreference.md)
`deliveryClass` | [DeliveryClass](DeliveryClass.md)
`kind` | [NotificationKind](NotificationKind.md)

## Example

```typescript
import type { NotificationPreferenceEntry } from ''

// TODO: Update the object below with actual values
const example = {
  "channels": null,
  "deliveryClass": null,
  "kind": null,
} satisfies NotificationPreferenceEntry

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as NotificationPreferenceEntry
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


