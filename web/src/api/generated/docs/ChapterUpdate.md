
# ChapterUpdate

Partial correction of Chapter metadata and its canonical Place reference.

## Properties

Name | Type
------------ | -------------
`description` | string
`endOn` | Date
`placeId` | string
`startOn` | Date
`title` | string

## Example

```typescript
import type { ChapterUpdate } from ''

// TODO: Update the object below with actual values
const example = {
  "description": null,
  "endOn": null,
  "placeId": null,
  "startOn": null,
  "title": null,
} satisfies ChapterUpdate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ChapterUpdate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


