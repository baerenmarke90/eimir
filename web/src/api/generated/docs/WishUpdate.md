
# WishUpdate

Wish title correction.  There is deliberately no ``status`` field. Wish status is controlled only by explicit lifecycle commands; an arbitrary status PATCH would provide a way around those transitions.

## Properties

Name | Type
------------ | -------------
`title` | string

## Example

```typescript
import type { WishUpdate } from ''

// TODO: Update the object below with actual values
const example = {
  "title": null,
} satisfies WishUpdate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as WishUpdate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


