
# OidcStartRequest


## Properties

Name | Type
------------ | -------------
`acceptedTermsVersion` | string
`client` | string
`invitationToken` | string
`signup` | boolean

## Example

```typescript
import type { OidcStartRequest } from ''

// TODO: Update the object below with actual values
const example = {
  "acceptedTermsVersion": null,
  "client": null,
  "invitationToken": null,
  "signup": null,
} satisfies OidcStartRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as OidcStartRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


