
# PresenceDeviceCredentialView

Returned once; only its hash is stored. It can only publish this owner\'s snapshot.

## Properties

Name | Type
------------ | -------------
`consentGeneration` | number
`credential` | string
`expiresAt` | Date

## Example

```typescript
import type { PresenceDeviceCredentialView } from ''

// TODO: Update the object below with actual values
const example = {
  "consentGeneration": null,
  "credential": null,
  "expiresAt": null,
} satisfies PresenceDeviceCredentialView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PresenceDeviceCredentialView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


