
# AccountCapabilitiesView

Current account capabilities used only for client presentation.

## Properties

Name | Type
------------ | -------------
`audioProcessingEnabled` | boolean
`auth` | [AuthCapabilities](AuthCapabilities.md)
`serverAdmin` | boolean
`videoProcessingEnabled` | boolean

## Example

```typescript
import type { AccountCapabilitiesView } from ''

// TODO: Update the object below with actual values
const example = {
  "audioProcessingEnabled": null,
  "auth": null,
  "serverAdmin": null,
  "videoProcessingEnabled": null,
} satisfies AccountCapabilitiesView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as AccountCapabilitiesView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


