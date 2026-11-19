
# RecapAnswerView

One partner\'s own answer to a guided question, cut at a sentence or word boundary.

## Properties

Name | Type
------------ | -------------
`authorId` | string
`authorName` | string
`text` | string

## Example

```typescript
import type { RecapAnswerView } from ''

// TODO: Update the object below with actual values
const example = {
  "authorId": null,
  "authorName": null,
  "text": null,
} satisfies RecapAnswerView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as RecapAnswerView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


