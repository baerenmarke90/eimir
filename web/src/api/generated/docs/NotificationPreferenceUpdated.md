
# NotificationPreferenceUpdated


## Properties

Name | Type
------------ | -------------
`channel` | [NotificationChannel](NotificationChannel.md)
`enabled` | boolean
`kind` | [NotificationKind](NotificationKind.md)

## Example

```typescript
import type { NotificationPreferenceUpdated } from ''

// TODO: Update the object below with actual values
const example = {
  "channel": null,
  "enabled": null,
  "kind": null,
} satisfies NotificationPreferenceUpdated

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as NotificationPreferenceUpdated
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


