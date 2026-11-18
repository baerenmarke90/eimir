
# SharedNotePresentation

Whether a note is pinned (overview and Wir) and whether Wir hides its excerpt.

## Properties

Name | Type
------------ | -------------
`pinned` | boolean
`wirTitleOnly` | boolean

## Example

```typescript
import type { SharedNotePresentation } from ''

// TODO: Update the object below with actual values
const example = {
  "pinned": null,
  "wirTitleOnly": null,
} satisfies SharedNotePresentation

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SharedNotePresentation
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


