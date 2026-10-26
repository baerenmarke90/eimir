
# DevicePushConfiguration


## Properties

Name | Type
------------ | -------------
`fcm` | [FcmConfiguration](FcmConfiguration.md)
`unifiedPush` | [UnifiedPushConfiguration](UnifiedPushConfiguration.md)

## Example

```typescript
import type { DevicePushConfiguration } from ''

// TODO: Update the object below with actual values
const example = {
  "fcm": null,
  "unifiedPush": null,
} satisfies DevicePushConfiguration

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as DevicePushConfiguration
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


