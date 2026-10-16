
# StoryViewReceipt

An intentional canonical-detail presentation reported by a client.

## Properties

Name | Type
------------ | -------------
`itemId` | string
`kind` | [StoryKind](StoryKind.md)

## Example

```typescript
import type { StoryViewReceipt } from ''

// TODO: Update the object below with actual values
const example = {
  "itemId": null,
  "kind": null,
} satisfies StoryViewReceipt

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as StoryViewReceipt
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


