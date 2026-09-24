
# NotificationPreferencesView


## Properties

Name | Type
------------ | -------------
`capabilities` | [Array&lt;NotificationChannelCapability&gt;](NotificationChannelCapability.md)
`catalogVersion` | number
`items` | [Array&lt;NotificationPreferenceEntry&gt;](NotificationPreferenceEntry.md)

## Example

```typescript
import type { NotificationPreferencesView } from ''

// TODO: Update the object below with actual values
const example = {
  "capabilities": null,
  "catalogVersion": null,
  "items": null,
} satisfies NotificationPreferencesView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as NotificationPreferencesView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


