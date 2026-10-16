
# CapabilitiesView


## Properties

Name | Type
------------ | -------------
`expiresInSeconds` | number
`localPassword` | boolean
`oidcConnections` | Array&lt;string&gt;
`passkey` | boolean

## Example

```typescript
import type { CapabilitiesView } from ''

// TODO: Update the object below with actual values
const example = {
  "expiresInSeconds": null,
  "localPassword": null,
  "oidcConnections": null,
  "passkey": null,
} satisfies CapabilitiesView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as CapabilitiesView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


