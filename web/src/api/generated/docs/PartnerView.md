
# PartnerView

Account projection exposed through a space response.  This is deliberately an allowlist. Accounts also contain authentication and contact data that do not belong in a space response; serializing the general model would eventually expose such fields by accident.

## Properties

Name | Type
------------ | -------------
`displayName` | string
`id` | string

## Example

```typescript
import type { PartnerView } from ''

// TODO: Update the object below with actual values
const example = {
  "displayName": null,
  "id": null,
} satisfies PartnerView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PartnerView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


