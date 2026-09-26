
# NotificationChannelCapability


## Properties

Name | Type
------------ | -------------
`available` | boolean
`channel` | [NotificationChannel](NotificationChannel.md)
`destination` | string
`reason` | string

## Example

```typescript
import type { NotificationChannelCapability } from ''

// TODO: Update the object below with actual values
const example = {
  "available": null,
  "channel": null,
  "destination": null,
  "reason": null,
} satisfies NotificationChannelCapability

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as NotificationChannelCapability
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


