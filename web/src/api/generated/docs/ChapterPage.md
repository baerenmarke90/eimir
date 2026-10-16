
# ChapterPage


## Properties

Name | Type
------------ | -------------
`hasMore` | boolean
`items` | [Array&lt;ChapterDetail&gt;](ChapterDetail.md)
`nextCursor` | string

## Example

```typescript
import type { ChapterPage } from ''

// TODO: Update the object below with actual values
const example = {
  "hasMore": null,
  "items": null,
  "nextCursor": null,
} satisfies ChapterPage

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ChapterPage
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


