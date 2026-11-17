# OidcConnectionView

A configured external sign-in provider, as an unauthenticated client may know it.  Only what a sign-in screen needs to draw a button and start the flow. The issuer, client identity and callback addresses stay in configuration.

## Properties

Name | Type
------------ | -------------
`id` | string
`label` | string
`nativeAvailable` | boolean
`provider` | string

## Example

```typescript
import type { OidcConnectionView } from ''

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "label": null,
  "nativeAvailable": null,
  "provider": null,
} satisfies OidcConnectionView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as OidcConnectionView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


