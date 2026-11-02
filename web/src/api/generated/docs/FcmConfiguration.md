
# FcmConfiguration


## Properties

Name | Type
------------ | -------------
`androidPackage` | string
`encryptedPreviewVersion` | number
`projectId` | string
`providerKey` | string

## Example

```typescript
import type { FcmConfiguration } from ''

// TODO: Update the object below with actual values
const example = {
  "androidPackage": null,
  "encryptedPreviewVersion": null,
  "projectId": null,
  "providerKey": null,
} satisfies FcmConfiguration

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as FcmConfiguration
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


