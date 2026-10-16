
# AuthCapabilities

Authoritative authentication capabilities for this instance.  Reused across the backend auth router, service layers, and capability projections to clients.

## Properties

Name | Type
------------ | -------------
`localPassword` | boolean
`magicLink` | boolean
`oidc` | boolean
`passkey` | boolean

## Example

```typescript
import type { AuthCapabilities } from ''

// TODO: Update the object below with actual values
const example = {
  "localPassword": null,
  "magicLink": null,
  "oidc": null,
  "passkey": null,
} satisfies AuthCapabilities

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as AuthCapabilities
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


