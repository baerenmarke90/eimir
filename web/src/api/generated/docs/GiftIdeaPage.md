
# GiftIdeaPage


## Properties

Name | Type
------------ | -------------
`hasMore` | boolean
`items` | [Array&lt;GiftIdeaDetail&gt;](GiftIdeaDetail.md)
`nextCursor` | string

## Example

```typescript
import type { GiftIdeaPage } from ''

// TODO: Update the object below with actual values
const example = {
  "hasMore": null,
  "items": null,
  "nextCursor": null,
} satisfies GiftIdeaPage

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as GiftIdeaPage
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


