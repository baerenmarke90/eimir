
# GameWishCandidate

Minimal authorized OPEN Wish context required by Wunschdetektiv.

## Properties

Name | Type
------------ | -------------
`createdBy` | string
`title` | string
`wishId` | string

## Example

```typescript
import type { GameWishCandidate } from ''

// TODO: Update the object below with actual values
const example = {
  "createdBy": null,
  "title": null,
  "wishId": null,
} satisfies GameWishCandidate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as GameWishCandidate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


