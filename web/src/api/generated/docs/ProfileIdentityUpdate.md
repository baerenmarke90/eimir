
# ProfileIdentityUpdate

Partial update of the authenticated account\'s presentation identity.  Omission means unchanged. An explicit null ``profileAttachmentId`` removes the current avatar; an explicit null ``birthday`` clears the optional birthday. ``displayName`` deliberately has no competing request-layer normalization; the identity domain remains the single authority.

## Properties

Name | Type
------------ | -------------
`birthday` | Date
`displayName` | string
`profileAttachmentId` | string

## Example

```typescript
import type { ProfileIdentityUpdate } from ''

// TODO: Update the object below with actual values
const example = {
  "birthday": null,
  "displayName": null,
  "profileAttachmentId": null,
} satisfies ProfileIdentityUpdate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ProfileIdentityUpdate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


