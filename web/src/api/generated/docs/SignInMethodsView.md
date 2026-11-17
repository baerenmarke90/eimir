
# SignInMethodsView

The ways this Account can currently sign in, beyond what it signed in with.

## Properties

Name | Type
------------ | -------------
`emailLink` | boolean
`localPassword` | boolean
`oidc` | [Array&lt;LinkedProviderView&gt;](LinkedProviderView.md)
`passkeys` | [Array&lt;PasskeyView&gt;](PasskeyView.md)

## Example

```typescript
import type { SignInMethodsView } from ''

// TODO: Update the object below with actual values
const example = {
  "emailLink": null,
  "localPassword": null,
  "oidc": null,
  "passkeys": null,
} satisfies SignInMethodsView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SignInMethodsView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


