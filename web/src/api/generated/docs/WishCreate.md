
# WishCreate

A wish is created from exactly one client field.  ``extra=\"forbid\"`` is more than hygiene here: M3-D01/D02 make ``status``, ``createdBy``, ``spaceId``, and ``version`` server-controlled. A request supplying those fields is rejected rather than silently stripped, so the client cannot believe it successfully set them.

## Properties

Name | Type
------------ | -------------
`title` | string

## Example

```typescript
import type { WishCreate } from ''

// TODO: Update the object below with actual values
const example = {
  "title": null,
} satisfies WishCreate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as WishCreate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


